import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet icon issue
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  snap_score: number | null;
  violations_count?: number;
}

export function Map() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      
      const { data: propertiesData, error: propertiesError } = await supabase
        .from("properties")
        .select("id, address, city, state, zip, latitude, longitude, snap_score")
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (propertiesError) throw propertiesError;

      // Fetch violation counts
      const { data: violationsData, error: violationsError } = await supabase
        .from("violations")
        .select("property_id");

      if (violationsError) throw violationsError;

      const violationCounts = (violationsData || []).reduce((acc, v) => {
        if (v.property_id) {
          acc[v.property_id] = (acc[v.property_id] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const propertiesWithCounts = (propertiesData || []).map(p => ({
        ...p,
        violations_count: violationCounts[p.id] || 0,
      }));

      setProperties(propertiesWithCounts);
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast({
        title: "Error",
        description: "Failed to load properties",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getScoreBadgeClass = (score: number | null) => {
    if (!score) return 'bg-slate-100 text-ink-600 border border-slate-200';
    if (score >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (score >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-ink-600 border border-slate-200';
  };

  // Default center (Chicago, IL)
  const defaultCenter: [number, number] = [41.8781, -87.6298];
  
  // Calculate center from properties if available
  const mapCenter = properties.length > 0
    ? [
        properties.reduce((sum, p) => sum + p.latitude, 0) / properties.length,
        properties.reduce((sum, p) => sum + p.longitude, 0) / properties.length,
      ] as [number, number]
    : defaultCenter;

  if (loading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto" />
          <p className="text-ink-400">Loading map...</p>
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <Card className="rounded-2xl shadow-card p-12 max-w-md mx-auto">
          <div className="text-center">
            <MapPin className="h-16 w-16 mx-auto text-ink-300 mb-4" />
            <h2 className="text-2xl font-bold text-ink-900 font-display mb-2">
              No Properties with Locations
            </h2>
            <p className="text-ink-500 font-ui mb-6">
              Upload properties with latitude/longitude data to see them on the map.
            </p>
            <Button className="rounded-xl bg-brand text-white hover:bg-brand/90">
              Upload Properties
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] relative">
      {/* Stats Overlay */}
      <div className="absolute top-4 left-4 z-[1000] space-y-2">
        <Card className="rounded-xl shadow-card p-3 backdrop-blur bg-white/90">
          <div className="text-xs text-ink-400 font-ui">Properties on Map</div>
          <div className="text-2xl font-bold text-ink-900 font-display">
            {properties.length}
          </div>
        </Card>
      </div>

      <MapContainer
        center={mapCenter}
        zoom={11}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {properties.map((property) => (
          <Marker
            key={property.id}
            position={[property.latitude, property.longitude]}
          >
            <Popup className="custom-popup">
              <div className="p-2 min-w-[240px]">
                <div className="mb-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getScoreBadgeClass(property.snap_score)}`}>
                    {property.snap_score && property.snap_score >= 80 ? "🔥 " : ""}
                    {property.snap_score ?? "N/A"}
                  </span>
                </div>
                <div className="font-bold text-ink-900 mb-1">{property.address}</div>
                <div className="text-sm text-ink-500 mb-2">
                  {property.city}, {property.state} {property.zip}
                </div>
                {property.violations_count > 0 && (
                  <div className="mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {property.violations_count} violation{property.violations_count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-full text-xs rounded-lg"
                  onClick={() => window.location.href = `/leads?property=${property.id}`}
                >
                  View Details
                </Button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
