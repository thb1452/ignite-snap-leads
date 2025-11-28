import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Flame } from "lucide-react";

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
    if (score >= 75) return "#E53935"; // Red (Critical Distress)
    if (score >= 50) return "#FA8900"; // Orange (High Distress)
    if (score >= 25) return "#F5C518"; // Yellow (Moderate Distress)
    return "#4A90E2"; // Blue (Low Distress)
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map - will be fitted to bounds once markers are added
    mapRef.current = L.map(mapContainerRef.current).setView([32.7355, -96.2743], 13); // Terrell, TX default

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
            ">${cluster.getChildCount()}</div>`,
            className: 'snap-cluster',
            iconSize: L.point(34, 34),
          });
        },
      });

      // Add markers for properties with coordinates
      properties.forEach(property => {
        if (property.latitude && property.longitude && mapRef.current) {
          const marker = L.circleMarker(
            [property.latitude, property.longitude],
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

      // Fit bounds if we have markers
      if (markersRef.current.length > 0) {
        const group = L.featureGroup(markersRef.current);
        mapRef.current.fitBounds(group.getBounds().pad(0.1));
      }
    } else {
      // Heatmap mode - zoom-scaled radius in meters
      heatLayerRef.current = L.layerGroup();
      const zoom = mapRef.current.getZoom();
      // Use much larger radius values (in meters) for visible heatmap effect
      // Adjust based on zoom: closer zoom = smaller radius needed
      const baseRadius = 5000 / Math.pow(2, zoom - 10);
      
      properties.forEach(property => {
        if (property.latitude && property.longitude && mapRef.current) {
          const intensity = (property.snap_score || 0) / 100;
          const circle = L.circle(
            [property.latitude, property.longitude],
            {
              radius: baseRadius,
              fillColor: intensity > 0.8 ? "#ef4444" : intensity > 0.6 ? "#f97316" : "#22c55e",
              color: "transparent",
              fillOpacity: 0.4,
              weight: 0,
            }
          );
          
          heatLayerRef.current!.addLayer(circle);
        }
      });

      mapRef.current.addLayer(heatLayerRef.current);
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

      {viewMode === "heatmap" && (
        <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur rounded-lg p-3 shadow-md text-xs">
          <div className="font-semibold mb-2">Density by SnapScore</div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
            <span>Low (0-59)</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
            <span>Medium (60-79)</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
            <span>High (80+)</span>
          </div>
        </div>
      )}
    </div>
  );
}
