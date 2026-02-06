import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Flame, Loader2 } from "lucide-react";
import { useViewportMarkers, type MapBounds } from "@/hooks/useViewportMarkers";
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

  // Reset and refetch when filters change
  useEffect(() => {
    if (mapReady && mapRef.current) {
      resetMarkers();
      handleMapMove();
    }
  }, [filters, mapReady, resetMarkers, handleMapMove]);

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
          const marker = L.circleMarker(
            [lat, lng],
            {
              radius: 8,
              fillColor: getMarkerColor(property.snap_score),
              color: "#fff",
              weight: 2,
              opacity: 1,
              fillOpacity: 0.9,
              snapScore: property.snap_score, // Store for cluster calculations
            } as any
          );

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
      // Heatmap mode - use gradient circles with blur effect
      heatLayerRef.current = L.layerGroup();
      
      // Sort by score so higher scores render on top
      const sortedMarkers = [...markers].sort((a, b) => (a.snap_score || 0) - (b.snap_score || 0));
      
      sortedMarkers.forEach(property => {
        if (property.latitude && property.longitude && mapRef.current) {
          const score = property.snap_score || 0;
          const intensity = score / 100;
          
          // Color based on score with gradient effect
          let color: string;
          let opacity: number;
          if (score >= 80) {
            color = "#ef4444"; // Red
            opacity = 0.7;
          } else if (score >= 60) {
            color = "#f97316"; // Orange
            opacity = 0.6;
          } else if (score >= 40) {
            color = "#eab308"; // Yellow
            opacity = 0.5;
          } else {
            color = "#22c55e"; // Green
            opacity = 0.4;
          }
          
          // Create multiple overlapping circles for a glow/heat effect
          // Outer glow
          const outerCircle = L.circleMarker(
            [property.latitude, property.longitude],
            {
              radius: 20 + (intensity * 15),
              fillColor: color,
              color: "transparent",
              fillOpacity: opacity * 0.3,
              weight: 0,
            }
          );
          
          // Middle ring
          const middleCircle = L.circleMarker(
            [property.latitude, property.longitude],
            {
              radius: 12 + (intensity * 8),
              fillColor: color,
              color: "transparent",
              fillOpacity: opacity * 0.5,
              weight: 0,
            }
          );
          
          // Core point
          const coreCircle = L.circleMarker(
            [property.latitude, property.longitude],
            {
              radius: 6 + (intensity * 4),
              fillColor: color,
              color: "#fff",
              fillOpacity: opacity * 0.9,
              weight: 1,
            }
          );
          
          coreCircle.bindPopup(`
            <div class="text-sm">
              <strong>${property.address}</strong><br/>
              <span class="text-muted-foreground">${property.city}, ${property.state}</span><br/>
              Score: ${score}
            </div>
          `);
          
          coreCircle.on("click", () => {
            if (onPropertyClick) {
              onPropertyClick(property.id);
            }
          });
          
          heatLayerRef.current!.addLayer(outerCircle);
          heatLayerRef.current!.addLayer(middleCircle);
          heatLayerRef.current!.addLayer(coreCircle);
        }
      });

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
      
      {/* Marker count indicator */}
      {!isLoading && totalInBounds > 0 && (
        <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur rounded-lg px-3 py-2 shadow-md text-sm">
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
          {viewMode === "heatmap" ? "Heat Intensity by Score" : "SnapScore Legend"}
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
