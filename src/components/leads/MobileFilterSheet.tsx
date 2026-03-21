import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, X, ListPlus, Home, Info, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/externalClient";
import { useQuery } from "@tanstack/react-query";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import type { SortOption } from "./SortByDropdown";

// Categories that require enterprise tier
const ENTERPRISE_ONLY_CATEGORIES = ['water_disconnection'];

interface MobileFilterSheetProps {
  // Enforcement area props
  selectedCity: string | null;
  selectedState: string | null;
  onCityChange: (value: string | null) => void;
  onStateChange: (value: string | null) => void;
  // Time props
  lastSeenDays: number | null;
  onLastSeenChange: (value: number | null) => void;
  // Enforcement signals props
  selectedSignal: string | null;
  onSignalChange: (value: string | null) => void;
  // Pressure level props
  openViolationsOnly: boolean;
  onOpenViolationsChange: (value: boolean) => void;
  multipleViolationsOnly: boolean;
  onMultipleViolationsChange: (value: boolean) => void;
  repeatOffenderOnly: boolean;
  onRepeatOffenderChange: (value: boolean) => void;
  // General
  onClearFilters: () => void;
  activeFilterCount: number;
  // Add all to list
  propertyCount?: number;
  onAddAllToList?: () => void;
  // Sort
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
}

export function MobileFilterSheet({
  selectedCity,
  selectedState,
  onCityChange,
  onStateChange,
  lastSeenDays,
  onLastSeenChange,
  selectedSignal,
  onSignalChange,
  openViolationsOnly,
  onOpenViolationsChange,
  multipleViolationsOnly,
  onMultipleViolationsChange,
  repeatOffenderOnly,
  onRepeatOffenderChange,
  onClearFilters,
  activeFilterCount,
  propertyCount = 0,
  onAddAllToList,
  sortBy,
  onSortChange,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);

  // Subscription gating
  const { hasFeature } = useFeatureAccess();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isProOrHigher = hasFeature('advanced_filters') || isAdmin;
  const isEnterprise = hasFeature('escalation_alerts') || isAdmin;

  const isLockedCategory = (categoryId: string) => {
    return ENTERPRISE_ONLY_CATEGORIES.includes(categoryId) && !isEnterprise;
  };

  const handleSignalChange = (value: string) => {
    if (value === "all") {
      onSignalChange(null);
      return;
    }

    // Check if this is an enterprise-only category
    if (ENTERPRISE_ONLY_CATEGORIES.includes(value) && !isEnterprise) {
      toast({
        title: "Elite Feature",
        description: "Water Disconnection data is available on the Elite plan.",
      });
      navigate('/pricing');
      return;
    }

    onSignalChange(value);
  };

  // Fetch states
  useEffect(() => {
    async function fetchStates() {
      setLoadingStates(true);
      try {
        const { data, error } = await supabase.rpc('fn_distinct_states');
        if (!error && data) {
          setStates((data as { state: string }[]).map(r => r.state).filter(Boolean));
        }
      } catch (e) {
        console.error('Error fetching states:', e);
      } finally {
        setLoadingStates(false);
      }
    }
    fetchStates();
  }, []);

  // Fetch cities based on state
  useEffect(() => {
    async function fetchCities() {
      setLoadingCities(true);
      try {
        const { data, error } = await supabase.rpc('fn_distinct_cities', {
          p_state: selectedState || null
        });
        if (!error && data) {
          setCities((data as { city: string }[]).map(r => r.city).filter(Boolean));
        }
      } catch (e) {
        console.error('Error fetching cities:', e);
      } finally {
        setLoadingCities(false);
      }
    }
    fetchCities();
  }, [selectedState]);

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["category-property-counts-mobile", selectedState, selectedCity],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_category_property_counts", {
        p_state: selectedState || null,
        p_city: selectedCity || null,
      });
      if (error) throw error;
      return ((data || []) as unknown as Array<{ category_id: string; category_label: string; property_count: number }>).map((row) => ({
        categoryId: row.category_id,
        label: row.category_label,
        propertyCount: row.property_count,
      }));
    },
    staleTime: 60000,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-10 min-h-[44px]">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] max-h-[85vh] rounded-t-2xl flex flex-col p-0">
        <SheetHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <SheetTitle className="text-lg font-semibold">Filters</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Filter properties by enforcement area and signals
            </SheetDescription>
          </div>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-muted-foreground h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Clear all
            </Button>
          )}
        </SheetHeader>
        
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Sort By */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Sort by</label>
            <Select
              value={sortBy}
              onValueChange={(val) => onSortChange(val as SortOption)}
            >
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="snap_score">Highest SnapScore</SelectItem>
                <SelectItem value="newest_violation">Newest Violations</SelectItem>
                <SelectItem value="recently_updated">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* State */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">State</label>
            <Select
              value={selectedState || "all"}
              onValueChange={(val) => onStateChange(val === "all" ? null : val)}
            >
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder={loadingStates ? "Loading..." : "All States"} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All States</SelectItem>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* City */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">City</label>
            <Select
              value={selectedCity || "all"}
              onValueChange={(val) => onCityChange(val === "all" ? null : val)}
              disabled={!selectedState}
            >
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder={!selectedState ? "Select state first" : loadingCities ? "Loading..." : "All Cities"} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wide">
              DATE RANGE
            </h3>
            <label className="text-sm font-semibold text-foreground">Last seen</label>
            <Select
              value={lastSeenDays?.toString() || "all"}
              onValueChange={(value) => onLastSeenChange(value === "all" ? null : parseInt(value))}
            >
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7">≤ 7 days</SelectItem>
                <SelectItem value="30">≤ 30 days</SelectItem>
                <SelectItem value="90">≤ 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Issue Type Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wide">
              ISSUE TYPE
            </h3>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Home className="h-4 w-4" />
              <span className="text-sm">Properties with these issues</span>
            </div>
            <label className="text-sm font-semibold text-foreground">Category</label>
            <Select
              value={selectedSignal || "all"}
              onValueChange={handleSignalChange}
            >
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder="All issues" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All issues</SelectItem>
                {categories.map(({ categoryId, label }) => {
                  const locked = isLockedCategory(categoryId);
                  return (
                    <SelectItem
                      key={categoryId}
                      value={categoryId}
                      className={locked ? "text-muted-foreground" : ""}
                    >
                      <span className="flex items-center gap-1">
                        {locked && <Lock className="h-3 w-3" />}
                        {label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Pressure Level Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
                PRESSURE LEVEL
                {!isProOrHigher && <Lock className="h-3 w-3 text-amber-500" />}
              </h3>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Info className="h-4 w-4" />
                <span className="text-sm">Filter by enforcement pressure indicators.</span>
              </div>
            </div>

            {!isProOrHigher ? (
              /* Locked state for Starter users */
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Unlock pressure filters to find properties under enforcement pressure:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 mb-4 ml-3 list-disc">
                  <li>Open Violations Only</li>
                  <li>Multiple Violations</li>
                  <li>Repeat Offenders</li>
                </ul>
                <Button
                  size="sm"
                  className="w-full gap-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
                  onClick={() => navigate('/pricing')}
                >
                  <Lock className="h-3 w-3" />
                  Upgrade to Pro
                </Button>
              </div>
            ) : (
              <>
                {/* Open Violations Only */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Open Violations Only</span>
                    <p className="text-xs text-muted-foreground">Show only properties with unresolved violations</p>
                  </div>
                  <Switch
                    checked={openViolationsOnly}
                    onCheckedChange={onOpenViolationsChange}
                  />
                </div>

                {/* Multiple Violations */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Multiple Violations</span>
                    <p className="text-xs text-muted-foreground">Properties with more than one violation</p>
                  </div>
                  <Switch
                    checked={multipleViolationsOnly}
                    onCheckedChange={onMultipleViolationsChange}
                  />
                </div>

                {/* Repeat Offender */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Repeat Offender</span>
                    <p className="text-xs text-muted-foreground">Same property, multiple enforcement cases</p>
                  </div>
                  <Switch
                    checked={repeatOffenderOnly}
                    onCheckedChange={onRepeatOffenderChange}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Fixed Buttons at bottom */}
        <div className="shrink-0 px-4 py-4 border-t bg-background space-y-2">
          {onAddAllToList && propertyCount > 0 && (
            <Button 
              variant="outline"
              className="w-full h-12 text-base font-medium gap-2" 
              onClick={() => {
                onAddAllToList();
                setOpen(false);
              }}
            >
              <ListPlus className="h-5 w-5" />
              + Add All Results
            </Button>
          )}
          <Button 
            className="w-full h-12 text-base font-medium" 
            onClick={() => setOpen(false)}
          >
            Show Results
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
