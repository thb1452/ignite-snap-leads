import { useState, useEffect } from "react";
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
import { LeadsTable } from "@/components/leads/LeadsTable";

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

export function Leads() {
  const [properties, setProperties] = useState<PropertyWithViolations[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<PropertyWithViolations[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [userLists, setUserLists] = useState<LeadList[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    cities: [],
    status: "",
    snapScoreRange: [0, 100],
    listId: "",
  });
  const { toast } = useToast();

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
        .order("snap_score", { ascending: false, nullsFirst: false });

      if (propertiesError) throw propertiesError;

      // Fetch violations for all properties
      const { data: violationsData, error: violationsError } = await supabase
        .from("violations")
        .select("*");

      if (violationsError) throw violationsError;

      // Fetch latest activity for all properties
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("lead_activity")
        .select("*")
        .order("created_at", { ascending: false });

      if (activitiesError) throw activitiesError;

      // Group violations by property_id
      const violationsByProperty = (violationsData || []).reduce((acc, violation) => {
        if (violation.property_id) {
          if (!acc[violation.property_id]) {
            acc[violation.property_id] = [];
          }
          acc[violation.property_id].push(violation);
        }
        return acc;
      }, {} as Record<string, Violation[]>);

      // Get latest activity by property_id
      const latestActivityByProperty = (activitiesData || []).reduce((acc, activity) => {
        if (activity.property_id && !acc[activity.property_id]) {
          acc[activity.property_id] = activity;
        }
        return acc;
      }, {} as Record<string, LeadActivity>);

      // Combine properties with their violations and latest activity
      const propertiesWithViolations = (propertiesData || []).map(property => ({
        ...property,
        violations: violationsByProperty[property.id] || [],
        latest_activity: latestActivityByProperty[property.id] || null,
      }));

      setProperties(propertiesWithViolations);
      setFilteredProperties(propertiesWithViolations);
      
      // Extract unique cities
      const uniqueCities = [...new Set(propertiesData?.map(p => p.city).filter(Boolean) || [])];
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

    // List filter - needs to fetch list properties
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

  const hotLeads = filteredProperties.filter(p => (p.snap_score ?? 0) >= 80).length;
  const multipleViolations = filteredProperties.filter(p => p.violations.length >= 3).length;
  const avgScore = filteredProperties.length > 0
    ? Math.round(filteredProperties.reduce((sum, p) => sum + (p.snap_score ?? 0), 0) / filteredProperties.length)
    : 0;

  return (
    <AppLayout>
      <div className="flex">
        {/* Premium Filters Sidebar */}
        <aside className="w-80 hidden lg:block">
          <div className="m-6 rounded-2xl bg-white shadow-card p-4 space-y-4">
            <div className="text-sm font-medium text-ink-700 font-ui">Filters</div>
            
            {/* Search */}
            <Input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Search address or violation…"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            />
            
            {/* Cities as pills */}
            <div className="flex flex-wrap gap-2">
              {availableCities.map(city => (
                <button
                  key={city}
                  onClick={() => toggleCity(city)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                    filters.cities.includes(city)
                      ? 'bg-brand/10 border-brand/30 text-brand-700'
                      : 'border-slate-200 text-ink-500 hover:border-slate-300'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
            
            {/* Range slider */}
            <div>
              <div className="text-xs text-ink-400 mb-2">
                SnapScore: <span className="font-medium text-ink-700">{filters.snapScoreRange[0]}–{filters.snapScoreRange[1]}</span>
              </div>
              <Slider
                value={filters.snapScoreRange}
                onValueChange={(value) => setFilters(prev => ({ ...prev, snapScoreRange: value as [number, number] }))}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>

            {/* My Lists */}
            <Select
              value={filters.listId || 'all'}
              onValueChange={(value) => setFilters(prev => ({ ...prev, listId: value === 'all' ? '' : value }))}
            >
              <SelectTrigger className="rounded-xl">
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

            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="w-full text-xs text-ink-500"
            >
              Clear Filters
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <section className="max-w-7xl mx-auto px-6 mt-6">
            {/* Hero Header */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-ink-900 font-display">Leads</h1>
                <p className="text-sm text-ink-400 font-ui">
                  Showing {filteredProperties.length} properties • Updated just now
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl border px-3 py-1.5 text-sm">
                  Save Filter
                </Button>
                <Button className="rounded-xl px-3 py-1.5 text-sm bg-ink-900 text-white hover:bg-ink-700">
                  Export CSV
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-2xl bg-white shadow-card p-4 space-y-2">
                <div className="text-xs text-ink-400 font-ui">Total Leads</div>
                <div className="text-3xl font-bold text-ink-900 font-display">
                  {filteredProperties.length}
                </div>
              </div>
              <div className="rounded-2xl bg-white shadow-card p-4 space-y-2">
                <div className="text-xs text-ink-400 font-ui">Hot Leads</div>
                <div className="text-3xl font-bold text-emerald-600 font-display flex items-center gap-2">
                  🔥 {hotLeads}
                </div>
              </div>
              <div className="rounded-2xl bg-white shadow-card p-4 space-y-2">
                <div className="text-xs text-ink-400 font-ui">Multiple Violations</div>
                <div className="text-3xl font-bold text-amber-600 font-display">
                  {multipleViolations}
                </div>
              </div>
              <div className="rounded-2xl bg-white shadow-card p-4 space-y-2">
                <div className="text-xs text-ink-400 font-ui">Avg SnapScore</div>
                <div className="text-3xl font-bold text-brand font-display">
                  {avgScore}
                </div>
              </div>
            </div>

            {/* Leads Table */}
            {loading ? (
              <div className="flex items-center justify-center p-12 bg-white rounded-2xl shadow-card">
                <div className="space-y-4 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto" />
                  <p className="text-ink-400">Loading properties...</p>
                </div>
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="flex items-center justify-center p-12 bg-white rounded-2xl shadow-card">
                <div className="text-center">
                  <p className="text-lg font-medium mb-2 text-ink-900">No leads here yet</p>
                  <p className="text-sm text-ink-400">Try widening SnapScore or importing a CSV</p>
                </div>
              </div>
            ) : (
              <LeadsTable properties={filteredProperties} />
            )}
          </section>
        </main>
      </div>
    </AppLayout>
  );
}
