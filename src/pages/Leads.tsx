import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeadsMap } from "@/components/leads/LeadsMap";
import { FilterBar } from "@/components/leads/FilterBar";
import { BulkActionBar } from "@/components/leads/BulkActionBar";
import { PropertyDetailPanel } from "@/components/leads/PropertyDetailPanel";
import { MobilePropertyDetailSheet } from "@/components/leads/MobilePropertyDetailSheet";
import { MobileFilterSheet } from "@/components/leads/MobileFilterSheet";
import { VirtualizedMobilePropertyList } from "@/components/leads/VirtualizedMobilePropertyList";
import { AddToListDialog } from "@/components/leads/AddToListDialog";
import { AddAllToListDialog } from "@/components/leads/AddAllToListDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Search, X, Map as MapIcon, List, Download, Loader2 } from "lucide-react";
import { VirtualizedPropertyList } from "@/components/leads/VirtualizedPropertyList";
import { EnforcementAreaFilter } from "@/components/leads/EnforcementAreaFilter";
import { EnforcementSignalsFilter } from "@/components/leads/EnforcementSignalsFilter";
import { PressureLevelFilter } from "@/components/leads/PressureLevelFilter";
import { TimeFilter } from "@/components/leads/ScoreAndTimeFilter";
import { SortByDropdown, type SortOption } from "@/components/leads/SortByDropdown";
import { useDemoCredits } from "@/hooks/useDemoCredits";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useOnboarding } from "@/hooks/useOnboarding";
import { FreshnessIndicator } from "@/components/leads/FreshnessIndicator";
import { UpgradePrompt, type ExportContext } from "@/components/subscription/UpgradePrompt";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import { exportFilteredCsv } from "@/services/export";
import { useProperties } from "@/hooks/useProperties";
import { useMapMarkers } from "@/hooks/useMapMarkers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ExportQuotaDisplay } from "@/components/leads/ExportQuotaDisplay";
import { WaterShutoffUpgradeBanner } from "@/components/leads/WaterShutoffUpgradeBanner";
import { SelectionActionBar } from "@/components/leads/SelectionActionBar";
import { AppLayout } from "@/components/layout/AppLayout";

const PAGE_SIZE = 50;

function Leads() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { showOnboarding, setShowOnboarding, markOnboardingComplete } = useOnboarding();
  const { plan, usage, refetch: refetchSubscription, getRemainingCount } = useSubscription();
  useSubscriptionGate({ showToast: false }); // Still needed for subscription context
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  // Enforcement Area filter state
  const [searchInput, setSearchInput] = useState(""); // Immediate input value
  const [searchQuery, setSearchQuery] = useState(""); // Debounced value for API
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);

  // Time filter state
  const [lastSeenDays, setLastSeenDays] = useState<number | null>(null);
  
  // Enforcement signals filter state
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  
  // Pressure level filter state
  const [openViolationsOnly, setOpenViolationsOnly] = useState(false);
  const [multipleViolationsOnly, setMultipleViolationsOnly] = useState(false);
  const [repeatOffenderOnly, setRepeatOffenderOnly] = useState(false);
  
  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>('snap_score');

  // Mobile view state
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  
  // Upgrade prompt state for export limits only
  const [upgradePromptType, setUpgradePromptType] = useState<'exports' | null>(null);
  
  // Demo credits hook
  const { isDemoMode, isAdmin } = useDemoCredits();

  // Debounce search input (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        setSearchQuery(searchInput);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [showAddToListDialog, setShowAddToListDialog] = useState(false);
  const [showAddAllToListDialog, setShowAddAllToListDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeLimitType, setUpgradeLimitType] = useState<'exports'>('exports');
  const [exportContextData, setExportContextData] = useState<ExportContext | undefined>(undefined);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (lastSeenDays !== null) count++;
    if (selectedCity) count++;
    if (selectedState) count++;
    if (selectedSignal) count++;
    if (openViolationsOnly) count++;
    if (multipleViolationsOnly) count++;
    if (repeatOffenderOnly) count++;
    return count;
  }, [lastSeenDays, selectedCity, selectedState, selectedSignal, openViolationsOnly, multipleViolationsOnly, repeatOffenderOnly]);

  // Build filters object for the hook - only include truthy values
  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};

    if (searchQuery?.trim()) f.search = searchQuery.trim();
    if (selectedCity) f.cities = [selectedCity];
    if (selectedState) f.state = selectedState;
    if (lastSeenDays !== null && lastSeenDays > 0) f.lastSeenDays = lastSeenDays;
    if (selectedSignal) f.violationType = selectedSignal;

    // Pressure level filters
    if (openViolationsOnly) f.openViolationsOnly = true;
    if (multipleViolationsOnly) f.multipleViolationsOnly = true;
    if (repeatOffenderOnly) f.repeatOffenderOnly = true;
    
    // Sorting - always include
    f.sortBy = sortBy;

    console.log("[Leads] Active filters:", JSON.stringify(f));
    return f;
  }, [searchQuery, selectedCity, selectedState, lastSeenDays, selectedSignal, openViolationsOnly, multipleViolationsOnly, repeatOffenderOnly, sortBy]);

  // Use paginated properties hook for the list
  const { data, isLoading, error, refetch } = useProperties(page, PAGE_SIZE, filters);
  
  // Use lightweight markers query for the map (filtered same as list)
  const { data: mapMarkers = [], error: mapError } = useMapMarkers(filters);
  
  // Show toast notifications for errors
  useEffect(() => {
    if (error) {
      console.error("[Leads] Properties error:", error);
      toast({
        title: "Failed to load properties",
        description: "Please try refreshing the page or check your connection.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  useEffect(() => {
    if (mapError) {
      console.error("[Leads] Map markers error:", mapError);
      toast({
        title: "Failed to load map data",
        description: "Map markers may not be displayed correctly.",
        variant: "destructive",
      });
    }
  }, [mapError, toast]);

  const properties = data?.data ?? [];
  const totalCount = data?.total ?? 0;
  const dataTier = data?.dataTier ?? null;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setLastSeenDays(null);
    setSelectedCity(null);
    setSelectedState(null);
    setSelectedSignal(null);
    setOpenViolationsOnly(false);
    setMultipleViolationsOnly(false);
    setRepeatOffenderOnly(false);
    setPage(1);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.length === properties.length ? [] : properties.map(p => p.id)
    );
  };

  // Handle page change with selection warning
  const handlePageChange = (newPage: number) => {
    if (selectedIds.length > 0) {
      setPendingPage(newPage);
    } else {
      setPage(newPage);
    }
  };

  const confirmPageChange = () => {
    if (pendingPage !== null) {
      setSelectedIds([]);
      setPage(pendingPage);
      setPendingPage(null);
    }
  };

  const cancelPageChange = () => {
    setPendingPage(null);
  };

  const handleExportCSV = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select properties to export",
        variant: "destructive",
      });
      return;
    }

    const propertyCount = selectedIds.length;
    const remaining = getRemainingCount('exports');
    const used = usage?.exports_count ?? 0;
    const max = plan?.max_monthly_exports ?? 0;

    // For unlimited plans (remaining === null), skip the client-side check
    if (remaining !== null && propertyCount > remaining) {
      // Show partial export option instead of just blocking
      setUpgradeLimitType('exports');
      setExportContextData({
        requestedCount: propertyCount,
        remainingCount: remaining,
        usedCount: used,
        maxCount: max,
        onPartialExport: async (count: number) => {
          const partialIds = selectedIds.slice(0, count);
          setIsExporting(true);
          try {
            await exportFilteredCsv({
              propertyIds: partialIds,
              expectedPropertyCount: partialIds.length,
            });
            await new Promise(resolve => setTimeout(resolve, 500));
            await refetchSubscription();
            toast({
              title: "Export Complete",
              description: `Exported ${partialIds.length.toLocaleString()} properties`,
            });
            setSelectedIds([]);
          } catch (err: any) {
            toast({ title: "Export Failed", description: err.message || "Failed to export", variant: "destructive" });
          } finally {
            setIsExporting(false);
          }
        },
      });
      setShowUpgradePrompt(true);
      return;
    }

    setIsExporting(true);
    try {
      const estimatedSeconds = Math.max(5, Math.ceil(selectedIds.length / 1000) * 2);
      const estimatedTime = estimatedSeconds > 60
        ? `~${Math.ceil(estimatedSeconds / 60)} minute${Math.ceil(estimatedSeconds / 60) > 1 ? 's' : ''}`
        : `~${estimatedSeconds} seconds`;

      toast({
        title: "Export Started",
        description: `Exporting ${selectedIds.length.toLocaleString()} properties to CSV. This may take ${estimatedTime} for large exports.`,
        duration: selectedIds.length > 1000 ? 10000 : 5000,
      });

      await exportFilteredCsv({
        propertyIds: selectedIds,
        expectedPropertyCount: propertyCount,
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Exported ${selectedIds.length.toLocaleString()} properties`,
      });

      setSelectedIds([]);
    } catch (error: any) {
      console.error('[Leads] Export error:', error);

      if (error.message === 'EXPORT_LIMIT_EXCEEDED') {
        // Server rejected — build context for partial export
        setUpgradeLimitType('exports');
        const serverRemaining = getRemainingCount('exports') ?? 0;
        setExportContextData({
          requestedCount: propertyCount,
          remainingCount: serverRemaining,
          usedCount: usage?.exports_count ?? 0,
          maxCount: plan?.max_monthly_exports ?? 0,
          onPartialExport: async (count: number) => {
            const partialIds = selectedIds.slice(0, count);
            setIsExporting(true);
            try {
              await exportFilteredCsv({
                propertyIds: partialIds,
                expectedPropertyCount: partialIds.length,
              });
              await new Promise(resolve => setTimeout(resolve, 500));
              await refetchSubscription();
              toast({
                title: "Export Complete",
                description: `Exported ${partialIds.length.toLocaleString()} properties`,
              });
              setSelectedIds([]);
            } catch (err: any) {
              toast({ title: "Export Failed", description: err.message || "Failed to export", variant: "destructive" });
            } finally {
              setIsExporting(false);
            }
          },
        });
        setShowUpgradePrompt(true);
        return;
      }

      toast({
        title: "Export Failed",
        description: error.message || "Failed to export properties",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Fetch violations for all properties (enables instant PropertyDetailPanel)
  // Memoize propertyIds to prevent query cache invalidation on every render
  const propertyIds = useMemo(() => properties.map(p => p.id), [properties]);
  const { data: violationsData = [], error: violationsError } = useQuery({
    queryKey: ["violations-for-properties", propertyIds],
    enabled: propertyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("violations")
        .select("id, violation_type, status, opened_date, property_id, case_id, description")
        .in("property_id", propertyIds)
        .order("property_id")
        .order("opened_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  // Show toast for violations query error
  useEffect(() => {
    if (violationsError) {
      console.error("[Leads] Violations error:", violationsError);
      toast({
        title: "Failed to load violation data",
        description: "Property details may be incomplete.",
        variant: "destructive",
      });
    }
  }, [violationsError, toast]);

  // Map properties to include violations when available from violationsData
  // This prevents N+1 queries when opening PropertyDetailPanel
  const mappedProperties = useMemo(() => {
    // Group violations by property_id for efficient lookup
    const violationsByPropertyId = new Map<string, any[]>();
    violationsData.forEach(v => {
      const existing = violationsByPropertyId.get(v.property_id) || [];
      existing.push(v);
      violationsByPropertyId.set(v.property_id, existing);
    });

    return properties.map(p => ({
      ...p,
      violations: violationsByPropertyId.get(p.id) || [],
    }));
  }, [properties, violationsData]);

  // Keep performance optimization with useMemo
  const selectedProperty = useMemo(() =>
    mappedProperties.find(p => p.id === selectedPropertyId) || null,
    [mappedProperties, selectedPropertyId]
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <OnboardingFlow
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        onComplete={markOnboardingComplete}
      />

      {/* Water shutoff upgrade banner for Starter users */}
      <WaterShutoffUpgradeBanner dataTier={dataTier} />

      <UpgradePrompt
        open={showUpgradePrompt}
        onOpenChange={setShowUpgradePrompt}
        limitType={upgradeLimitType}
        currentPlan={plan?.name}
        exportContext={exportContextData}
      />

      {/* DESKTOP: Filter Bar */}
      <div className="hidden md:block">
        <FilterBar
          searchQuery={searchInput}
          onSearchChange={setSearchInput}
          lastSeenDays={lastSeenDays}
          selectedCity={selectedCity}
          selectedState={selectedState}
          selectedSignal={selectedSignal}
          openViolationsOnly={openViolationsOnly}
          multipleViolationsOnly={multipleViolationsOnly}
          repeatOffenderOnly={repeatOffenderOnly}
          propertyCount={totalCount}
          onClearFilters={handleClearFilters}
          onAddAllToList={() => setShowAddAllToListDialog(true)}
        />
        
        <div className="flex flex-wrap gap-6 px-4 py-4 border-b bg-background">
          {/* Enforcement Area */}
          <EnforcementAreaFilter
            selectedCity={selectedCity}
            selectedState={selectedState}
            onCityChange={(c) => { setSelectedCity(c); setPage(1); }}
            onStateChange={(s) => { setSelectedState(s); setPage(1); }}
          />

          {/* Date Range */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Date Range
            </span>
            <TimeFilter
              lastSeenDays={lastSeenDays}
              onLastSeenChange={(v) => { setLastSeenDays(v); setPage(1); }}
            />
          </div>
          
          {/* Enforcement Signals - Available to all users */}
          <EnforcementSignalsFilter
            selectedSignal={selectedSignal}
            onSignalChange={(v) => { 
              setSelectedSignal(v); 
              setPage(1);
              // Clear search when category changes to avoid conflicting filters
              if (v) setSearchInput("");
            }}
            selectedState={selectedState}
            selectedCity={selectedCity}
          />
          
          {/* Pressure Level - Available to all users */}
          <PressureLevelFilter
            openViolationsOnly={openViolationsOnly}
            onOpenViolationsChange={(v) => { setOpenViolationsOnly(v); setPage(1); }}
            multipleViolationsOnly={multipleViolationsOnly}
            onMultipleViolationsChange={(v) => { setMultipleViolationsOnly(v); setPage(1); }}
            repeatOffenderOnly={repeatOffenderOnly}
            onRepeatOffenderChange={(v) => { setRepeatOffenderOnly(v); setPage(1); }}
          />
        </div>
      </div>

      {/* MOBILE: Compact Header with Search + Filters */}
      <div className="md:hidden border-b bg-background">
        <div className="flex items-center gap-2 p-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-10"
            />
            {searchInput && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => { setSearchInput(""); setSearchQuery(""); }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <MobileFilterSheet
            selectedCity={selectedCity}
            selectedState={selectedState}
            onCityChange={(c) => { setSelectedCity(c); setPage(1); }}
            onStateChange={(s) => { setSelectedState(s); setPage(1); }}
            lastSeenDays={lastSeenDays}
            onLastSeenChange={(v) => { setLastSeenDays(v); setPage(1); }}
            selectedSignal={selectedSignal}
            onSignalChange={(v) => { setSelectedSignal(v); setPage(1); if (v) setSearchInput(""); }}
            openViolationsOnly={openViolationsOnly}
            onOpenViolationsChange={(v) => { setOpenViolationsOnly(v); setPage(1); }}
            multipleViolationsOnly={multipleViolationsOnly}
            onMultipleViolationsChange={(v) => { setMultipleViolationsOnly(v); setPage(1); }}
            repeatOffenderOnly={repeatOffenderOnly}
            onRepeatOffenderChange={(v) => { setRepeatOffenderOnly(v); setPage(1); }}
            onClearFilters={handleClearFilters}
            activeFilterCount={activeFilterCount}
            propertyCount={totalCount}
            onAddAllToList={() => setShowAddAllToListDialog(true)}
            sortBy={sortBy}
            onSortChange={(v) => { setSortBy(v); setPage(1); }}
          />
        </div>

        {/* Freshness indicator + View Toggle */}
        <div className="flex items-center justify-between px-3 pb-2">
          <FreshnessIndicator />
          <div className="inline-flex rounded-lg border bg-muted p-1">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mobileView === 'list'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMobileView('list')}
            >
              <List className="h-4 w-4" />
              List
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                mobileView === 'map'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMobileView('map')}
            >
              <MapIcon className="h-4 w-4" />
              Map
            </button>
          </div>
        </div>
        
        {/* Export Quota for Mobile */}
        <div className="px-3 pb-3">
          <ExportQuotaDisplay />
        </div>
      </div>

      {/* DESKTOP: Side-by-side layout */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Map - Left Side */}
        <div className="w-[60%] border-r relative">
          <LeadsMap
            properties={mapMarkers}
            onPropertyClick={setSelectedPropertyId}
            selectedPropertyId={selectedPropertyId || undefined}
          />
        </div>

        {/* Property List - Right Side */}
        <div className="w-[40%] flex flex-col relative">
          {/* Header with View Mode Toggle and Export */}
          {properties.length > 0 && (
            <div className="px-4 py-2 border-b bg-background flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.length > 0
                      ? `${selectedIds.length} selected`
                      : `${totalCount.toLocaleString()} properties`}
                  </span>
                  <SortByDropdown value={sortBy} onChange={(v) => { setSortBy(v); setPage(1); }} />
                </div>
                <Button
                  onClick={handleExportCSV}
                  disabled={selectedIds.length === 0}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                </Button>
              </div>
              <ExportQuotaDisplay />
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading properties...
              </div>
            ) : properties.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No properties found
              </div>
            ) : (
              <VirtualizedPropertyList
                properties={mappedProperties}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onPropertyClick={setSelectedPropertyId}
              />
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-background">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <BulkActionBar
            selectedCount={selectedIds.length}
            totalCount={properties.length}
            allSelected={selectedIds.length === properties.length && properties.length > 0}
            onToggleSelectAll={handleToggleSelectAll}
            onExport={handleExportCSV}
            onAddToList={() => setShowAddToListDialog(true)}
            isExporting={isExporting}
          />
        </div>
      </div>

      {/* MOBILE: Stacked layout */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        {mobileView === 'map' ? (
          /* Map View - Full height */
          <div className="flex-1 relative">
            <LeadsMap
              properties={mapMarkers}
              onPropertyClick={setSelectedPropertyId}
              selectedPropertyId={selectedPropertyId || undefined}
            />
          </div>
        ) : (
          /* List View */
          <div className="flex-1 flex flex-col min-h-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading properties...
              </div>
            ) : properties.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No properties found
              </div>
            ) : (
              <div
                className="flex-1 flex flex-col overflow-hidden"
                style={{ paddingBottom: 'var(--bottom-nav-height)' }}
              >
                {/* Select All Header + Export */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-background border-b">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.length === properties.length && properties.length > 0}
                      onCheckedChange={handleToggleSelectAll}
                      className="h-5 w-5"
                    />
                    <span className="text-sm font-medium">
                      {selectedIds.length > 0
                        ? `${selectedIds.length} selected`
                        : `Select all (${properties.length})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedIds.length > 0 && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleExportCSV}
                          disabled={isExporting}
                          className="h-8 text-xs gap-1"
                        >
                          {isExporting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          Export ({selectedIds.length})
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedIds([])}
                          className="h-8 text-xs text-muted-foreground"
                        >
                          Clear
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Virtualized Mobile Property List */}
                <VirtualizedMobilePropertyList
                  properties={mappedProperties}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onPropertyClick={(id) => setSelectedPropertyId(id)}
                />

                {/* Mobile Pagination */}
                <div className="flex items-center justify-center gap-4 px-4 py-3 border-t bg-background">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 min-h-[44px] px-4 gap-1"
                    onClick={() => handlePageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 min-h-[44px] px-4 gap-1"
                    onClick={() => handlePageChange(Math.min(totalPages || 1, page + 1))}
                    disabled={page >= (totalPages || 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Property Detail - Desktop uses Panel, Mobile uses Sheet */}
      {selectedPropertyId && !isMobile && (
        <PropertyDetailPanel
          property={selectedProperty}
          open={!!selectedPropertyId}
          onOpenChange={(open) => !open && setSelectedPropertyId(null)}
        />
      )}
      
      {selectedPropertyId && isMobile && (
        <MobilePropertyDetailSheet
          property={selectedProperty}
          open={!!selectedPropertyId}
          onOpenChange={(open) => !open && setSelectedPropertyId(null)}
          onAddToList={(propertyId) => {
            setSelectedIds([propertyId]);
            setShowAddToListDialog(true);
          }}
        />
      )}

      {/* Add to List Dialog (for selected properties) */}
      <AddToListDialog
        open={showAddToListDialog}
        onOpenChange={setShowAddToListDialog}
        propertyIds={selectedIds}
        onSuccess={() => {
          setSelectedIds([]);
          setShowAddToListDialog(false);
        }}
      />

      {/* Add All Filtered to List Dialog */}
      <AddAllToListDialog
        open={showAddAllToListDialog}
        onOpenChange={setShowAddAllToListDialog}
        totalMatchingCount={totalCount}
        filters={{
          city: selectedCity,
          state: selectedState,
        }}
        onSuccess={() => {
          toast({
            title: "List Updated",
            description: "Properties have been added to your list",
          });
        }}
      />

      {/* Upgrade Prompt for Export Limits */}
      <UpgradePrompt
        open={!!upgradePromptType}
        onOpenChange={(open) => !open && setUpgradePromptType(null)}
        limitType={upgradePromptType || 'exports'}
      />

      {/* Floating Selection Action Bar - shows on mobile and when items selected */}
      {isMobile && (
        <SelectionActionBar
          selectedCount={selectedIds.length}
          onExportCSV={handleExportCSV}
          onAddToList={() => setShowAddToListDialog(true)}
          onClearSelection={() => setSelectedIds([])}
          isExporting={isExporting}
        />
      )}

      {/* Page Change Warning Dialog */}
      <AlertDialog open={pendingPage !== null} onOpenChange={(open) => !open && cancelPageChange()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear selection?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {selectedIds.length} properties selected. Changing pages will clear your selection. 
              Would you like to export first or continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPageChange}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => { handleExportCSV(); cancelPageChange(); }}>
              Export First
            </Button>
            <AlertDialogAction onClick={confirmPageChange}>
              Continue & Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </AppLayout>
  );
}

export default Leads;
