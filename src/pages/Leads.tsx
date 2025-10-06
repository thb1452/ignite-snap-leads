import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, X } from "lucide-react";

interface Property {
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
}

interface Filters {
  search: string;
  cities: string[];
  status: string;
  snapScoreRange: [number, number];
}

export function Leads() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    cities: [],
    status: "",
    snapScoreRange: [0, 100],
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("snap_score", { ascending: false, nullsFirst: false });

      if (error) throw error;

      setProperties(data || []);
      setFilteredProperties(data || []);
      
      // Extract unique cities
      const uniqueCities = [...new Set(data?.map(p => p.city).filter(Boolean) || [])];
      setAvailableCities(uniqueCities.sort());
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

  useEffect(() => {
    applyFilters();
  }, [filters, properties]);

  const applyFilters = () => {
    let filtered = [...properties];

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
      // We'll implement status filtering when we add violation counts
    }

    // SnapScore filter
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

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Sidebar - Filters */}
        <aside className="hidden lg:block w-80 border-r bg-white overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Filters Header */}
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

            {/* Status Dropdown */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'all' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
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
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6">
            {/* Results Count */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                {filteredProperties.length} leads found
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Showing {filteredProperties.length} of {properties.length} total properties
              </p>
            </div>

            {/* Leads Content - Placeholder for table */}
            <Card className="bg-white">
              <div className="p-12 text-center text-gray-500">
                {loading ? (
                  <div className="space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
                    <p>Loading properties...</p>
                  </div>
                ) : filteredProperties.length === 0 ? (
                  <div>
                    <p className="text-lg font-medium mb-2">No leads found</p>
                    <p className="text-sm">Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-lg font-medium mb-2">✅ Dashboard ready!</p>
                    <p className="text-sm text-gray-600">
                      Found {filteredProperties.length} properties from {availableCities.length} cities
                    </p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                      {filteredProperties.slice(0, 3).map(property => (
                        <div key={property.id} className="text-left p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant={property.snap_score && property.snap_score >= 80 ? "default" : "secondary"}>
                              Score: {property.snap_score}
                            </Badge>
                          </div>
                          <p className="font-medium text-sm mb-1">{property.address}</p>
                          <p className="text-xs text-gray-500">{property.city}, {property.state}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Leads table coming next! 🚀</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
