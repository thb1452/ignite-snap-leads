import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  const [viewMode, setViewMode] = useState<"map" | "heatmap">("map");

  const getMarkerColor = (score: number | null) => {
    if (!score) return "#64748b";
    if (score >= 80) return "#ef4444";
    if (score >= 60) return "#f97316";
    return "#22c55e";
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map centered on first property with coords or default
    const firstProperty = properties.find(p => p.latitude && p.longitude);
    const center: [number, number] = firstProperty
      ? [firstProperty.latitude!, firstProperty.longitude!]
      : [39.8283, -98.5795]; // Center of US

    mapRef.current = L.map(mapContainerRef.current).setView(center, 12);

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

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

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
          }
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

        marker.addTo(mapRef.current);
        markersRef.current.push(marker);
      }
    });

    // Fit bounds if we have markers
    if (markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      mapRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  }, [properties, onPropertyClick]);

  return (
    <div className="relative h-full z-0">
      <div ref={mapContainerRef} className="absolute inset-0 rounded-lg" />
      
      <div className="absolute bottom-4 left-4 z-[1000] flex gap-2">
        <Button
          variant={viewMode === "map" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("map")}
          className="gap-2 bg-background/95 backdrop-blur"
        >
          <MapIcon className="h-4 w-4" />
          Map
        </Button>
        <Button
          variant={viewMode === "heatmap" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("heatmap")}
          className="gap-2 bg-background/95 backdrop-blur"
        >
          <Flame className="h-4 w-4" />
          Heatmap
        </Button>
      </div>
    </div>
  );
}
