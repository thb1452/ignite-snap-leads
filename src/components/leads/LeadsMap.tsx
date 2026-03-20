import { useEffect, useRef, useState, useCallback, memo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Flame, Loader2 } from "lucide-react";
import { useViewportMarkers, type MapBounds } from "@/hooks/useViewportMarkers";
import { supabase } from "@/integrations/supabase/externalClient";
import { jitterCoords } from "@/utils/jitterCoords";
import type { LeadFilters } from "@/schemas";

// USA center coordinates and default zoom - defined outside component
const USA_CENTER: L.LatLngTuple = [39.8283, -98.5795];
const USA_ZOOM = 5; // Start zoomed out to show all US
const SELECT_ZOOM = 17; // Zoom level used when focusing a selected property
const MARKER_BATCH_SIZE = 500; // Keep marker rendering responsive for large datasets
const RENDER_COUNT_UPDATE_INTERVAL = 1000; // Update "X rendered" every N items to reduce re-renders

// Stable color mapping for markers (avoids recreating function each render)
function getMarkerColor(score: number | null): string {
  if (!score) return "#64748b";
  if (score >= 75) return "#E53935";
  if (score >= 50) return "#FA8900";
  if (score >= 25) return "#F5C518";
  return "#4A90E2";
}

interface LeadsMapProps {
  filters?: LeadFilters;
  onPropertyClick?: (propertyId: string) => void;
  selectedPropertyId?: string;
  unlockedSet?: Set<string>;
  // Legacy props for backwards compatibility - will be ignored if filters is provided
  properties?: { id: string; latitude: number | null; longitude: number | null; snap_score: number | null; address: string; }[];
}

const LeadsMapInner = ({ filters = {}, onPropertyClick, selectedPropertyId }: LeadsMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const markerClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const highlightRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);
  const markersIndexRef = useRef<Map<string, { latitude: number | null; longitude: number | null }>>(new Map());
  const selectionJobIdRef = useRef(0);
  const lastFocusedPropertyIdRef = useRef<string | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "heatmap">("map");
  const [mapReady, setMapReady] = useState(false);
  const [isRenderingMarkers, setIsRenderingMarkers] = useState(false);
  const [renderedMarkersCount, setRenderedMarkersCount] = useState(0);

  // Use viewport-based loading
  const { markers, isLoading, totalInBounds, fetchMarkersInBounds, resetMarkers } = useViewportMarkers(filters);

  // Handler ref holds latest fetch logic; handleMapMove stays stable to prevent map remount loop.
  const handleMapMoveRef = useRef<() => void>(() => {});
  handleMapMoveRef.current = () => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    const mapBounds: MapBounds = {
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    };

    fetchMarkersInBounds(mapBounds);
  };

  const handleMapMove = useCallback(() => {
    handleMapMoveRef.current();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map with USA-wide view
    mapRef.current = L.map(mapContainerRef.current, {
      minZoom: 3,
      maxZoom: 18,
    }).setView(USA_CENTER, USA_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);

    // Set up event listeners for viewport-based loading
    mapRef.current.on("moveend", handleMapMove);
    mapRef.current.on("zoomend", handleMapMove);

    setMapReady(true);

    // Initial load
    setTimeout(() => {
      handleMapMove();
    }, 100);

    return () => {
      if (mapRef.current) {
        mapRef.current.off("moveend", handleMapMove);
        mapRef.current.off("zoomend", handleMapMove);
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [handleMapMove]);

  // Reset and refetch when filters change (excluding sortBy since map markers don't use sorting)
  // Extract sortBy to exclude it from the dependency - map markers are always sorted by snap_score
  const { sortBy: _sortBy, ...mapRelevantFilters } = filters;
  const mapFiltersKey = JSON.stringify(mapRelevantFilters);
  
  useEffect(() => {
    if (mapReady && mapRef.current) {
      resetMarkers();
      handleMapMove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFiltersKey, mapReady, resetMarkers, handleMapMove]);

  // Render markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    // Clear existing markers and layers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    
    if (markerClusterGroupRef.current) {
      mapRef.current.removeLayer(markerClusterGroupRef.current);
      markerClusterGroupRef.current = null;
    }
    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (viewMode === "map") {
      // Create marker cluster group.
      // NOTE: Cluster icon rendering must be very cheap for 25k-50k datasets, so we avoid expensive
      // getAllChildMarkers()/averaging work here.
      markerClusterGroupRef.current = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 16,
        chunkedLoading: true, // Spread DOM work across frames to prevent UI lag
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          
          // Size based on count
          let size = 34;
          if (count >= 1000) size = 50;
          else if (count >= 100) size = 42;

          // Keep cluster color neutral; individual markers remain score-colored once clustering is disabled.
          const color = count >= 1000 ? "#ef4444" : count >= 100 ? "#f97316" : "#22c55e";
          
          return L.divIcon({
            html: `<div style="
              background:${color};
              color:#fff;
              border-radius:9999px;
              width:${size}px;
              height:${size}px;
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight:600;
              font-size:${count >= 1000 ? '11px' : '13px'};
              box-shadow:0 2px 8px rgba(0,0,0,.25);
              border:2px solid white;
            ">${count >= 1000 ? Math.round(count/1000) + 'k' : count}</div>`,
            className: 'snap-cluster',
            iconSize: L.point(size, size),
          });
        },
      });

      setIsRenderingMarkers(true);
      setRenderedMarkersCount(0);

      // Add markers in animation frames so we don't block the main thread.
      const clusterGroup = markerClusterGroupRef.current;
      mapRef.current.addLayer(clusterGroup);

      markersIndexRef.current.clear();

      let cancelled = false;
      let i = 0;
      const batchSize = markers.length > 20000 ? 200 : MARKER_BATCH_SIZE;

      const addBatch = () => {
        if (cancelled || !mapRef.current || !markerClusterGroupRef.current) return;

        const end = Math.min(markers.length, i + batchSize);
        const slice = markers.slice(i, end);

        for (const property of slice) {
          const lat = property.latitude;
          const lng = property.longitude;
          if (lat == null || lng == null) continue;
          if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

          markersIndexRef.current.set(property.id, { latitude: lat, longitude: lng });

          const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: getMarkerColor(property.snap_score),
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
          });

          marker.on("click", () => {
            // Record the focus so the selection effect doesn't double-fly.
            lastFocusedPropertyIdRef.current = property.id;
            // Immediate map focus for responsiveness.
            // Details panel selection happens via onPropertyClick.
            if (onPropertyClick) onPropertyClick(property.id);
            // Center + zoom to exact coordinates.
            const map = mapRef.current;
            if (!map || !mapReady) return;

            selectionJobIdRef.current += 1;
            const jobId = selectionJobIdRef.current;

            if (highlightRef.current) {
              map.removeLayer(highlightRef.current);
              highlightRef.current = null;
            }

            map.stop();
            map.flyTo(L.latLng(lat, lng), SELECT_ZOOM, { duration: 1.0, easeLinearity: 0.35 });

            map.once("moveend", () => {
              if (selectionJobIdRef.current !== jobId || !mapRef.current) return;

              const highlight = L.layerGroup();

              const glowRing = L.circleMarker([lat, lng], {
                radius: 24,
                fillColor: "transparent",
                color: "#3b82f6",
                weight: 3,
                opacity: 0.5,
                className: "snap-pulse-ring",
              });

              const outerRing = L.circleMarker([lat, lng], {
                radius: 16,
                fillColor: "transparent",
                color: "#fff",
                weight: 4,
                opacity: 0.95,
              });

              const innerRing = L.circleMarker([lat, lng], {
                radius: 16,
                fillColor: "transparent",
                color: "#3b82f6",
                weight: 2,
                opacity: 1,
              });

              const centerDot = L.circleMarker([lat, lng], {
                radius: 4,
                fillColor: "#3b82f6",
                color: "#fff",
                weight: 2,
                fillOpacity: 1,
                opacity: 1,
              });

              highlight.addLayer(glowRing);
              highlight.addLayer(outerRing);
              highlight.addLayer(innerRing);
              highlight.addLayer(centerDot);
              highlight.addTo(mapRef.current!);
              highlightRef.current = highlight;
            });
          });

          clusterGroup.addLayer(marker);
          markersRef.current.push(marker);
        }

        i = end;
        // Throttle state updates to reduce re-renders; always update on final batch
        if (i >= markers.length || i % RENDER_COUNT_UPDATE_INTERVAL === 0) {
          setRenderedMarkersCount(i);
        }
        if (i < markers.length) {
          requestAnimationFrame(addBatch);
        } else {
          setIsRenderingMarkers(false);
        }
      };

      requestAnimationFrame(addBatch);

      return () => {
        cancelled = true;
        setIsRenderingMarkers(false);
      };
    } else {
      // ZIP Pressure Heatmap mode - aggregated circles by ZIP code
      heatLayerRef.current = L.layerGroup();
      
      // Fetch ZIP pressure data
      const fetchZipPressure = async () => {
        const { data: zipData, error: zipError } = await supabase
          .rpc("fn_zip_pressure", {
            p_state: filters.state || null,
            p_city: filters.cities?.length === 1 ? filters.cities[0] : null,
          });
        
        if (zipError || !zipData) {
          console.error("[LeadsMap] ZIP pressure error:", zipError);
          return;
        }
        
        if (!mapRef.current || !heatLayerRef.current) return;
        
        type ZipPressureRow = {
          avg_lat: number | null;
          avg_lng: number | null;
          avg_score: number | null;
          property_count: number | null;
          zip: string;
        };

        (zipData as ZipPressureRow[]).forEach((zip) => {
          if (!zip.avg_lat || !zip.avg_lng) return;
          
          const score = Number(zip.avg_score) || 0;
          const count = Number(zip.property_count) || 1;
          
          // Color based on avg score
          let color: string;
          let opacity: number;
          if (score >= 75) { color = "#ef4444"; opacity = 0.7; }
          else if (score >= 50) { color = "#f97316"; opacity = 0.6; }
          else if (score >= 25) { color = "#eab308"; opacity = 0.5; }
          else { color = "#22c55e"; opacity = 0.4; }
          
          // Size based on property count (log scale)
          const radius = Math.max(15, Math.min(50, 12 + Math.log2(count) * 8));
          
          // Outer glow
          const outerCircle = L.circle(
            [Number(zip.avg_lat), Number(zip.avg_lng)],
            {
              radius: radius * 80,
              fillColor: color,
              color: "transparent",
              fillOpacity: opacity * 0.2,
              weight: 0,
            }
          );
          
          // Core circle
          const coreCircle = L.circleMarker(
            [Number(zip.avg_lat), Number(zip.avg_lng)],
            {
              radius: radius,
              fillColor: color,
              color: "#fff",
              fillOpacity: opacity,
              weight: 2,
            }
          );
          
          coreCircle.bindPopup(`
            <div class="text-sm">
              <strong>ZIP ${zip.zip}</strong><br/>
              <span>Avg Score: <strong>${score}</strong></span><br/>
              <span>${count} ${count === 1 ? 'property' : 'properties'}</span>
            </div>
          `);
          
          heatLayerRef.current!.addLayer(outerCircle);
          heatLayerRef.current!.addLayer(coreCircle);
        });
      };
      
      fetchZipPressure();
      mapRef.current.addLayer(heatLayerRef.current);
    }
  }, [markers, onPropertyClick, viewMode, mapReady]);

  // Fly to selected property and add highlight (list -> details -> map)
  const abortRef = useRef<AbortController | null>(null);
  
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    if (!selectedPropertyId) return;
    // If the last selection already focused this property, avoid double flyTo/highlight.
    if (lastFocusedPropertyIdRef.current === selectedPropertyId) return;

    // Abort any in-flight DB lookup from a previous selection
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Stop any ongoing flyTo animation for snappy sequential clicks
    mapRef.current.stop();

    // Clear previous highlight
    if (highlightRef.current) {
      mapRef.current.removeLayer(highlightRef.current);
      highlightRef.current = null;
    }

    // Switch to map mode if in heatmap so the marker is visible
    if (viewMode === "heatmap") {
      setViewMode("map");
    }

    const flyToAndHighlight = (lat: number, lng: number) => {
      if (!mapRef.current) return;

      // Offset the center slightly to the right to account for any left-side panel
      // This keeps the marker visually centered in the visible map area
      const map = mapRef.current;
      const targetLatLng = L.latLng(lat, lng);

      // Mark as focused so we don't double-fly for the same selection.
      lastFocusedPropertyIdRef.current = selectedPropertyId;

      selectionJobIdRef.current += 1;
      const jobId = selectionJobIdRef.current;

      map.flyTo(targetLatLng, SELECT_ZOOM, {
        duration: 1.0,
        easeLinearity: 0.35,
      });

      // Add highlight after flyTo animation completes
      const addHighlight = () => {
        if (!mapRef.current) return;
        if (selectionJobIdRef.current !== jobId) return;
        
        // Clear again in case of race condition
        if (highlightRef.current) {
          mapRef.current.removeLayer(highlightRef.current);
        }

        const highlight = L.layerGroup();

        // Outer pulsing glow ring
        const glowRing = L.circleMarker([lat, lng], {
          radius: 24,
          fillColor: "transparent",
          color: "#3b82f6",
          weight: 3,
          opacity: 0.5,
          className: "snap-pulse-ring",
        });

        // White border ring
        const outerRing = L.circleMarker([lat, lng], {
          radius: 16,
          fillColor: "transparent",
          color: "#fff",
          weight: 4,
          opacity: 0.95,
        });

        // Primary color inner ring
        const innerRing = L.circleMarker([lat, lng], {
          radius: 16,
          fillColor: "transparent",
          color: "#3b82f6",
          weight: 2,
          opacity: 1,
        });

        // Center dot for precise location
        const centerDot = L.circleMarker([lat, lng], {
          radius: 4,
          fillColor: "#3b82f6",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
          opacity: 1,
        });

        highlight.addLayer(glowRing);
        highlight.addLayer(outerRing);
        highlight.addLayer(innerRing);
        highlight.addLayer(centerDot);
        highlight.addTo(mapRef.current!);
        highlightRef.current = highlight;
      };

      // Wait for flyTo to finish before adding highlight
      map.once("moveend", addHighlight);
    };

    // Try to find in current markers first (avoid tying this effect to markers state to prevent races).
    const found = markersIndexRef.current.get(selectedPropertyId);
    if (found?.latitude != null && found?.longitude != null) {
      flyToAndHighlight(found.latitude, found.longitude);
      return;
    }

    // Fallback: fetch from DB with abort support
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      const { data } = await supabase
        .from("properties")
        .select("latitude, longitude")
        .eq("id", selectedPropertyId)
        .single();
      
      if (controller.signal.aborted) return;
      if (data?.latitude != null && data?.longitude != null) {
        flyToAndHighlight(Number(data.latitude), Number(data.longitude));
      }
    })().catch(() => {/* aborted */});
  }, [selectedPropertyId, mapReady, viewMode]);


  return (
    <div className="relative h-full z-0">
      <div ref={mapContainerRef} className="absolute inset-0 rounded-lg" />
      
      {/* Loading indicator */}
      {(isLoading || isRenderingMarkers) && (
        <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur rounded-lg px-3 py-2 shadow-md flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading markers...
        </div>
      )}
      
      {/* Marker count indicator - positioned below zoom controls */}
      {viewMode === "map" && !isLoading && renderedMarkersCount > 0 && (
        <div className="absolute top-24 left-2 z-[1000] bg-background/95 backdrop-blur rounded-lg px-3 py-2 shadow-md text-sm">
          <span className="font-medium">{renderedMarkersCount.toLocaleString()}</span>
          <span className="text-muted-foreground"> properties rendered</span>
        </div>
      )}
      
      <div className="absolute bottom-4 left-4 z-[1000] flex gap-2">
        <Button
          variant={viewMode === "map" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("map")}
          className="gap-2 bg-background/95 backdrop-blur shadow-md"
        >
          <MapIcon className="h-4 w-4" />
          Map
        </Button>
        <Button
          variant={viewMode === "heatmap" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("heatmap")}
          className="gap-2 bg-background/95 backdrop-blur shadow-md"
        >
          <Flame className="h-4 w-4" />
          Heatmap
        </Button>
      </div>

      {/* Legend - show for both modes */}
      <div className="absolute top-4 right-4 z-[1000] bg-background/95 backdrop-blur rounded-lg p-3 shadow-md text-xs">
        <div className="font-semibold mb-2">
          {viewMode === "heatmap" ? "ZIP Pressure Heatmap" : "SnapScore Legend"}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
          <span>Low (0-24)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-full" style={{ background: '#eab308' }} />
          <span>Moderate (25-49)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
          <span>High (50-74)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
          <span>Critical (75+)</span>
        </div>
      </div>
    </div>
  );
};

export const LeadsMap = memo(LeadsMapInner);
