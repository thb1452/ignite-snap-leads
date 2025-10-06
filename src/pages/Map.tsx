import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, X } from "lucide-react";
import { PropertyDetailPanel } from "@/components/leads/PropertyDetailPanel";

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
}

interface LeadActivity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  violations: Violation[];
  latest_activity?: LeadActivity | null;
}

interface Filters {
  search: string;
  cities: string[];
  status: string;
  snapScoreRange: [number, number];
  listId: string;
}

interface LeadList {
  id: string;
  name: string;
}

// Custom marker icons based on SnapScore
const createMarkerIcon = (snapScore: number | null, violationCount: number) => {
  let color = "#9CA3AF"; // gray - default
  
  if (snapScore !== null) {
    if (snapScore >= 80) color = "#EF4444"; // red - hot
    else if (snapScore >= 60) color = "#F97316"; // orange - warm
    else if (snapScore >= 40) color = "#EAB308"; // yellow - medium
  }

  const size = violationCount >= 3 ? 32 : 24;

  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${size === 32 ? '14px' : '11px'};
      ">
        ${snapScore ?? '?'}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};


export function Map() {
  const [properties, setProperties] = useState<PropertyWithViolations[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<PropertyWithViolations[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [userLists, setUserLists] = useState<LeadList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithViolations | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    cities: [],
    status: "",
    snapScoreRange: [0, 100],
    listId: "",
  });
  const { toast } = useToast();

  // Default center (will be updated to center of properties)
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // Center of USA
  const [mapZoom, setMapZoom] = useState(4);

  useEffect(() => {
    fetchProperties();
    fetchUserLists();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const { data: propertiesData, error: propertiesError } = await supabase
        .from("properties")
        .select("*")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("snap_score", { ascending: false, nullsFirst: false });

      if (propertiesError) throw propertiesError;

      const { data: violationsData, error: violationsError } = await supabase
        .from("violations")
        .select("*");

      if (violationsError) throw violationsError;

      const { data: activitiesData, error: activitiesError } = await supabase
        .from("lead_activity")
        .select("*")
        .order("created_at", { ascending: false });

      if (activitiesError) throw activitiesError;

      const violationsByProperty = (violationsData || []).reduce((acc, violation) => {
        if (violation.property_id) {
          if (!acc[violation.property_id]) {
            acc[violation.property_id] = [];
          }
          acc[violation.property_id].push(violation);
        }
        return acc;
      }, {} as Record<string, Violation[]>);

      const latestActivityByProperty = (activitiesData || []).reduce((acc, activity) => {
        if (activity.property_id && !acc[activity.property_id]) {
          acc[activity.property_id] = activity;
        }
        return acc;
      }, {} as Record<string, LeadActivity>);

      const propertiesWithViolations = (propertiesData || []).map(property => ({
        ...property,
        violations: violationsByProperty[property.id] || [],
        latest_activity: latestActivityByProperty[property.id] || null,
      }));

      setProperties(propertiesWithViolations);
      setFilteredProperties(propertiesWithViolations);
      
      const uniqueCities = [...new Set(propertiesData?.map(p => p.city).filter(Boolean) || [])];
      setAvailableCities(uniqueCities.sort());

      // Calculate center of all properties
      if (propertiesData && propertiesData.length > 0) {
        const validCoords = propertiesData.filter(p => p.latitude && p.longitude);
        if (validCoords.length > 0) {
          const avgLat = validCoords.reduce((sum, p) => sum + Number(p.latitude), 0) / validCoords.length;
          const avgLng = validCoords.reduce((sum, p) => sum + Number(p.longitude), 0) / validCoords.length;
          setMapCenter([avgLat, avgLng]);
          setMapZoom(10);
        }
      }
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

  const fetchUserLists = async () => {
    try {
      const { data, error } = await supabase
        .from("lead_lists")
        .select("id, name")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUserLists(data || []);
    } catch (error) {
      console.error("Error fetching lists:", error);
    }
  };

  useEffect(() => {
    applyFilters();
  }, [filters, properties]);

  const applyFilters = async () => {
    let filtered = [...properties];

    if (filters.listId) {
      try {
        const { data: listPropertiesData, error } = await supabase
          .from("list_properties")
          .select("property_id")
          .eq("list_id", filters.listId);

        if (error) throw error;

        const propertyIdsInList = listPropertiesData?.map((lp) => lp.property_id) || [];
        filtered = filtered.filter(p => propertyIdsInList.includes(p.id));
      } catch (error) {
        console.error("Error filtering by list:", error);
      }
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.address.toLowerCase().includes(searchLower) ||
          p.city.toLowerCase().includes(searchLower) ||
          p.zip.includes(filters.search)
      );
    }

    if (filters.cities.length > 0) {
      filtered = filtered.filter(p => filters.cities.includes(p.city));
    }

    if (filters.status) {
      // Filter by status
    }

    filtered = filtered.filter(
      p =>
        p.snap_score !== null &&
        p.snap_score >= filters.snapScoreRange[0] &&
        p.snap_score <= filters.snapScoreRange[1]
    );

    setFilteredProperties(filtered);
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      cities: [],
      status: "",
      snapScoreRange: [0, 100],
      listId: "",
    });
  };

  const toggleCity = (city: string) => {
    setFilters(prev => ({
      ...prev,
      cities: prev.cities.includes(city)
        ? prev.cities.filter(c => c !== city)
        : [...prev.cities, city]
    }));
  };

  const handleMarkerClick = (property: PropertyWithViolations) => {
    setSelectedProperty(property);
    setDetailPanelOpen(true);
  };

  const getScoreBadgeVariant = (score: number | null) => {
    if (!score) return "secondary";
    if (score >= 80) return "score-high";
    if (score >= 50) return "score-medium";
    return "score-low";
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Sidebar - Filters */}
        <aside className="hidden lg:block w-80 border-r bg-white overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search address, violation..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* City Multi-Select */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">City</Label>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {availableCities.map(city => (
                  <label
                    key={city}
                    className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={filters.cities.includes(city)}
                      onChange={() => toggleCity(city)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{city}</span>
                  </label>
                ))}
              </div>
              {filters.cities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {filters.cities.map(city => (
                    <Badge
                      key={city}
                      variant="secondary"
                      className="text-xs"
                    >
                      {city}
                      <button
                        onClick={() => toggleCity(city)}
                        className="ml-1 hover:text-red-600"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* My Lists Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">My Lists</Label>
              <Select
                value={filters.listId || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, listId: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Leads" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leads</SelectItem>
                  {userLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SnapScore Range Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-gray-700">SnapScore Range</Label>
                <span className="text-sm font-medium text-blue-600">
                  {filters.snapScoreRange[0]} - {filters.snapScoreRange[1]}
                </span>
              </div>
              <Slider
                value={filters.snapScoreRange}
                onValueChange={(value) => setFilters(prev => ({ ...prev, snapScoreRange: value as [number, number] }))}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            {/* Map Stats */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium text-gray-900">
                {filteredProperties.length} properties on map
              </p>
            </div>
          </div>
        </aside>

        {/* Main Map Area */}
        <main className="flex-1 relative">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="relative h-full w-full">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                style={{ height: "100%", width: "100%" }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {filteredProperties
                  .filter((property) => property.latitude && property.longitude)
                  .map((property) => (
                    <Marker
                      key={property.id}
                      position={[Number(property.latitude), Number(property.longitude)]}
                      icon={createMarkerIcon(property.snap_score, property.violations.length)}
                    >
                      <Popup>
                        <div style={{ minWidth: '200px' }}>
                          <div style={{ fontWeight: 'bold' }}>
                            SnapScore: {property.snap_score ?? 'N/A'}
                          </div>
                          <div>{property.address}</div>
                          <div>{property.city}, {property.state}</div>
                          <div>Violations: {property.violations.length}</div>
                          <button 
                            onClick={() => handleMarkerClick(property)}
                            style={{
                              marginTop: '8px',
                              padding: '4px 8px',
                              backgroundColor: '#3B82F6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            View Details
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>
          )}
        </main>
      </div>

      {detailPanelOpen && selectedProperty && (
        <PropertyDetailPanel
          property={selectedProperty}
          open={detailPanelOpen}
          onOpenChange={setDetailPanelOpen}
        />
      )}
    </AppLayout>
  );
}
