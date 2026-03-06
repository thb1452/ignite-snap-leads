import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Flame, Loader2 } from "lucide-react";
import { useViewportMarkers, type MapBounds } from "@/hooks/useViewportMarkers";
import { supabase } from "@/integrations/supabase/externalClient";
import type { LeadFilters } from "@/schemas";

// USA center coordinates and default zoom - defined outside component
const USA_CENTER: L.LatLngTuple = [39.8283, -98.5795];
const USA_ZOOM = 5; // Start zoomed out to show all US
const VIEWPORT_LIMIT = 1000; // Max markers per viewport load

interface LeadsMapProps {
  filters?: LeadFilters;
  onPropertyClick?: (propertyId: string) => void;
  selectedPropertyId?: string;
  // Legacy props for backwards compatibility - will be ignored if filters is provided
  properties?: { id: string; latitude: number | null; longitude: number | null; snap_score: number | null; address: string; }[];
}

export function LeadsMap({ filters = {}, onPropertyClick, selectedPropertyId, properties: legacyProperties }: LeadsMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const markerClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const highlightRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "heatmap">("map");
  const [mapReady, setMapReady] = useState(false);

  // Use viewport-based loading
  const { markers, isLoading, totalInBounds, fetchMarkersInBounds, resetMarkers } = useViewportMarkers(filters);

  const getMarkerColor = (score: number | null) => {
    if (!score) return "#64748b"; // Gray for null
    if (score >= 75) return "#E53935"; // Red (Critical Pressure)
    if (score >= 50) return "#FA8900"; // Orange (High Pressure)
    if (score >= 25) return "#F5C518"; // Yellow (Moderate Pressure)
    return "#4A90E2"; // Blue (Low Pressure)
  };

  // Extract bounds from map and trigger fetch
  const handleMapMove = useCallback(() => {
    if (!mapRef.current) return;
    
    const bounds = mapRef.current.getBounds();
    const mapBounds: MapBounds = {
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    };
    
    fetchMarkersInBounds(mapBounds);
  }, [fetchMarkersInBounds]);

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
      // Create marker cluster group with custom icons based on avg score
      markerClusterGroupRef.current = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 16,
        chunkedLoading: true, // Enable chunked loading for performance
        iconCreateFunction: (cluster) => {
          const childMarkers = cluster.getAllChildMarkers();
          const scores = childMarkers.map((m: any) => m.options?.snapScore ?? 0);
          const avg = scores.reduce((a: number, b: number) => a + b, 0) / Math.max(1, scores.length);
          const count = cluster.getChildCount();
          
          // Size based on count
          let size = 34;
          if (count >= 1000) size = 50;
          else if (count >= 100) size = 42;
          
          const color = avg >= 75 ? '#ef4444' : avg >= 50 ? '#f97316' : avg >= 25 ? '#eab308' : '#22c55e';
          
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

      // Add markers for all loaded viewport markers
      markers.forEach(property => {
        const lat = property.latitude;
        const lng = property.longitude;
        
        if (lat && lng && mapRef.current) {
          const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: getMarkerColor(property.snap_score),
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
          });

          marker.bindPopup(`
            <div class="text-sm">
              <strong>${property.address}</strong><br/>
              <span class="text-muted-foreground">${property.city}, ${property.state}</span><br/>
              Score: ${property.snap_score || "N/A"}
            </div>
          `);

          marker.on("click", () => {
            if (onPropertyClick) {
              onPropertyClick(property.id);
            }
          });

          markerClusterGroupRef.current!.addLayer(marker);
          markersRef.current.push(marker);
        }
      });

      mapRef.current.addLayer(markerClusterGroupRef.current);
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

  return (
    <div className="relative h-full z-0">
      <div ref={mapContainerRef} className="absolute inset-0 rounded-lg" />
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur rounded-lg px-3 py-2 shadow-md flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading markers...
        </div>
      )}
      
      {/* Marker count indicator - positioned below zoom controls */}
      {!isLoading && totalInBounds > 0 && (
        <div className="absolute top-24 left-2 z-[1000] bg-background/95 backdrop-blur rounded-lg px-3 py-2 shadow-md text-sm">
          <span className="font-medium">{totalInBounds.toLocaleString()}</span>
          <span className="text-muted-foreground"> properties in view</span>
          {totalInBounds >= VIEWPORT_LIMIT && (
            <span className="text-amber-600 text-xs block">Top {VIEWPORT_LIMIT.toLocaleString()} shown • Zoom in for more</span>
          )}
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
}
