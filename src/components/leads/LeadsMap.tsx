import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Flame } from "lucide-react";

// USA center coordinates and default zoom - defined outside component
const USA_CENTER: L.LatLngTuple = [39.8283, -98.5795];
const USA_ZOOM = 7; // Zoomed in for better visibility

interface Property {
  id: string;
  latitude: number | null;
  longitude: number | null;
  snap_score: number | null;
  address: string;
}

interface LeadsMapProps {
  properties: Property[];
  onPropertyClick?: (propertyId: string) => void;
  selectedPropertyId?: string;
}

export function LeadsMap({ properties, onPropertyClick, selectedPropertyId }: LeadsMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const markerClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "heatmap">("map");

  const getMarkerColor = (score: number | null) => {
    if (!score) return "#64748b"; // Gray for null
    if (score >= 75) return "#E53935"; // Red (Critical Pressure)
    if (score >= 50) return "#FA8900"; // Orange (High Pressure)
    if (score >= 25) return "#F5C518"; // Yellow (Moderate Pressure)
    return "#4A90E2"; // Blue (Low Pressure)
  };

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

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers and layers with hard null
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
        iconCreateFunction: (cluster) => {
          const markers = cluster.getAllChildMarkers();
          const scores = markers.map((m: any) => m.options?.snapScore ?? 0);
          const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
          const color = avg >= 80 ? '#ef4444' : avg >= 60 ? '#f97316' : '#22c55e';
          
          return L.divIcon({
            html: `<div style="
              background:${color};
              color:#fff;
              border-radius:9999px;
              width:34px;
              height:34px;
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight:600;
              font-size:14px;
              box-shadow:0 2px 8px rgba(0,0,0,.2);
              border:2px solid white;
            "></div>`,
            className: 'snap-cluster',
            iconSize: L.point(34, 34),
          });
        },
      });

      // Add markers for properties with valid coordinates (filter out 0,0 which is in Africa)
      properties.forEach(property => {
        // Only add markers for properties with valid US coordinates
        // Includes: Continental US, Alaska, Hawaii, Puerto Rico
        const lat = property.latitude;
        const lng = property.longitude;
        
        // Check for valid US coordinates across all territories
        const isContiguousUS = lat && lng && lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;
        const isAlaska = lat && lng && lat >= 51 && lat <= 72 && lng >= -180 && lng <= -129;
        const isHawaii = lat && lng && lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154;
        const isPuertoRico = lat && lng && lat >= 17 && lat <= 19 && lng >= -68 && lng <= -65;
        const isValidCoord = lat && lng && Math.abs(lat) > 1 && Math.abs(lng) > 1 && 
          (isContiguousUS || isAlaska || isHawaii || isPuertoRico);
        
        if (isValidCoord && mapRef.current) {
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

      // Fit bounds if we have markers, with smart zoom levels
      if (markersRef.current.length > 0) {
        const group = L.featureGroup(markersRef.current);
        const bounds = group.getBounds();

        // Calculate geographic spread to determine appropriate zoom
        const latSpread = bounds.getNorth() - bounds.getSouth();
        const lngSpread = bounds.getEast() - bounds.getWest();

        // Determine max zoom based on geographic spread - prefer zoomed in views
        let maxZoom = 15;

        if (latSpread < 0.5 && lngSpread < 0.5) {
          // Very small area (single city/neighborhood) - zoom in close
          maxZoom = 15;
        } else if (latSpread < 2 && lngSpread < 2) {
          // City-level spread
          maxZoom = 13;
        } else if (latSpread < 5 && lngSpread < 5) {
          // County/metro area spread
          maxZoom = 11;
        } else if (latSpread < 10 && lngSpread < 10) {
          // State-level spread
          maxZoom = 9;
        } else {
          // Multi-state or national spread - still keep it reasonably zoomed
          maxZoom = 7;
        }

        // Fit bounds with calculated zoom constraints
        mapRef.current.fitBounds(bounds.pad(0.1), {
          maxZoom: maxZoom,
        });
      } else {
        // No markers - reset to USA-wide view
        mapRef.current.setView(USA_CENTER, USA_ZOOM);
      }
    } else {
      // Heatmap mode - use gradient circles with blur effect
      heatLayerRef.current = L.layerGroup();
      
      // Helper to check valid US coordinates (includes all territories)
      const isValidUSCoord = (lat: number | null, lng: number | null) => {
        if (!lat || !lng || Math.abs(lat) < 1 || Math.abs(lng) < 1) return false;
        const isContiguousUS = lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;
        const isAlaska = lat >= 51 && lat <= 72 && lng >= -180 && lng <= -129;
        const isHawaii = lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154;
        const isPuertoRico = lat >= 17 && lat <= 19 && lng >= -68 && lng <= -65;
        return isContiguousUS || isAlaska || isHawaii || isPuertoRico;
      };
      
      // Sort by score so higher scores render on top, filter valid coords
      const sortedProperties = [...properties]
        .filter(p => isValidUSCoord(p.latitude, p.longitude))
        .sort((a, b) => (a.snap_score || 0) - (b.snap_score || 0));
      
      sortedProperties.forEach(property => {
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
      
      // Fit bounds to show all heat points with smart zoom (only valid US coords)
      const validProperties = properties.filter(p => isValidUSCoord(p.latitude, p.longitude));
      if (validProperties.length > 0) {
        const bounds = L.latLngBounds(
          validProperties.map(p => [p.latitude!, p.longitude!] as L.LatLngTuple)
        );

        // Calculate geographic spread to determine appropriate zoom
        const latSpread = bounds.getNorth() - bounds.getSouth();
        const lngSpread = bounds.getEast() - bounds.getWest();

        // Determine max zoom based on geographic spread
        let maxZoom = 15;

        if (latSpread < 0.5 && lngSpread < 0.5) {
          maxZoom = 14;
        } else if (latSpread < 2 && lngSpread < 2) {
          maxZoom = 12;
        } else if (latSpread < 5 && lngSpread < 5) {
          maxZoom = 10;
        } else if (latSpread < 10 && lngSpread < 10) {
          maxZoom = 8;
        } else {
          maxZoom = 6;
        }

        mapRef.current.fitBounds(bounds.pad(0.1), {
          maxZoom: maxZoom,
        });
      } else {
        // No valid properties - reset to USA-wide view
        mapRef.current.setView(USA_CENTER, USA_ZOOM);
      }
    }
  }, [properties, onPropertyClick, viewMode]);

  return (
    <div className="relative h-full z-0">
      <div ref={mapContainerRef} className="absolute inset-0 rounded-lg" />
      
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
          <span>Low (0-39)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-full" style={{ background: '#eab308' }} />
          <span>Moderate (40-59)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
          <span>High (60-79)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
          <span>Critical (80+)</span>
        </div>
      </div>
    </div>
  );
}
