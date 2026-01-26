import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeadsMap } from "@/components/leads/LeadsMap";
import { FilterBar } from "@/components/leads/FilterBar";
import { BulkActionBar } from "@/components/leads/BulkActionBar";
import { PropertyDetailPanel } from "@/components/leads/PropertyDetailPanel";
import { MobilePropertyDetailSheet } from "@/components/leads/MobilePropertyDetailSheet";
import { MobileFilterSheet } from "@/components/leads/MobileFilterSheet";
import { MobilePropertyCard } from "@/components/leads/MobilePropertyCard";
import { AddToListDialog } from "@/components/leads/AddToListDialog";
import { BulkDeleteDialog } from "@/components/leads/BulkDeleteDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, ChevronLeft, ChevronRight, Search, X, Map as MapIcon, List } from "lucide-react";
import { VirtualizedPropertyList } from "@/components/leads/VirtualizedPropertyList";
import { ViolationListView } from "@/components/leads/ViolationListView";
import { ViewModeToggle, type ViewMode } from "@/components/leads/ViewModeToggle";
import { EnforcementAreaFilter } from "@/components/leads/EnforcementAreaFilter";
import { EnforcementSignalsFilter } from "@/components/leads/EnforcementSignalsFilter";
import { PressureLevelFilter } from "@/components/leads/PressureLevelFilter";
import { TimeFilter } from "@/components/leads/ScoreAndTimeFilter";
import { generateInsights } from "@/services/insights";
import { useDemoCredits } from "@/hooks/useDemoCredits";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useOnboarding } from "@/hooks/useOnboarding";
import { FreshnessIndicator } from "@/components/leads/FreshnessIndicator";
import { UpgradePrompt } from "@/components/subscription/UpgradePrompt";
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
  const { plan, checkLimit, refetch: refetchSubscription } = useSubscription();
  const { hasFeature } = useSubscriptionGate({ showToast: false });
  // State selection removed - all users now see all properties across all states
  // Pagination state
  const [page, setPage] = useState(1);

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
  
  // Mobile view state
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  
  // View mode state (property vs violation)
  const [viewMode, setViewMode] = useState<ViewMode>('property');
  
  // Upgrade prompt state for gated features
  const [upgradePromptType, setUpgradePromptType] = useState<'advanced_filters' | 'violation_filtering' | null>(null);
  
  // Check if user has access to advanced filters
  const hasAdvancedFilters = hasFeature('advanced_filters');
  const hasViolationFiltering = hasFeature('violation_filtering');
  
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
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeLimitType, setUpgradeLimitType] = useState<'exports'>('exports');

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

    console.log("[Leads] Active filters:", JSON.stringify(f));
    return f;
  }, [searchQuery, selectedCity, selectedState, lastSeenDays, selectedSignal, openViolationsOnly, multipleViolationsOnly, repeatOffenderOnly]);

  // Use paginated properties hook for the list
  const { data, isLoading, error, refetch } = useProperties(page, PAGE_SIZE, filters);
  
  // Use lightweight markers query for the map (filtered same as list)
  const { data: mapMarkers = [], error: mapError } = useMapMarkers(filters);
  
  // Log any errors
  if (error) console.error("[Leads] Properties error:", error);
  if (mapError) console.error("[Leads] Map markers error:", mapError);
  
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

  const handleExportCSV = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select properties to export",
        variant: "destructive",
      });
      return;
    }

    const limitResult = await checkLimit('exports');
    if (!limitResult.allowed) {
      setUpgradeLimitType('exports');
      setShowUpgradePrompt(true);
      return;
    }

    setIsExporting(true);
    try {
      toast({
        title: "Export Started",
        description: `Exporting ${selectedIds.length} properties to CSV...`,
      });

      await exportFilteredCsv({
        propertyIds: selectedIds,
      });

      // Refetch subscription usage to update the export counter in UI
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Successfully exported ${selectedIds.length} properties`,
      });

      setSelectedIds([]);
    } catch (error: any) {
      console.error('[Leads] Export error:', error);

      if (error.message === 'EXPORT_LIMIT_EXCEEDED') {
        setUpgradeLimitType('exports');
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

  const handleGenerateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      const propertyIds = properties.map(p => p.id);
      
      toast({
        title: "Generating Insights",
        description: `Analyzing ${propertyIds.length} properties...`,
      });

      const result = await generateInsights(propertyIds);
      
      toast({
        title: "Insights Generated",
        description: `Generated insights for ${result.processed} properties`,
      });

      refetch();
    } catch (error: any) {
      console.error("Insight generation error:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate insights",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // Map properties to include violations placeholder (they're not fetched in paged query)
  const mappedProperties = useMemo(() =>
    properties.map(p => ({
      ...p,
      violations: [] as any[],
    })),
    [properties]
  );

  // Fetch violations when in violation view mode
  const propertyIds = properties.map(p => p.id);
  const { data: violationsData = [] } = useQuery({
    queryKey: ["violations-for-properties", propertyIds, viewMode],
    enabled: viewMode === 'violation' && propertyIds.length > 0,
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

  // Map violations with property data for violation view
  const violationsWithProperty = useMemo(() => {
    if (viewMode !== 'violation') return [];

    const propertyMap = new Map(properties.map(p => [p.id, p]));

    return violationsData.map(v => ({
      ...v,
      property: propertyMap.get(v.property_id) || {
        id: v.property_id,
        address: 'Unknown',
        city: '',
        state: '',
        zip: '',
        snap_score: null,
      }
    }));
  }, [violationsData, properties, viewMode]);

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
          
          {/* Enforcement Signals - Gated behind advanced_filters */}
          {hasAdvancedFilters ? (
            <EnforcementSignalsFilter
              selectedSignal={selectedSignal}
              onSignalChange={(v) => { setSelectedSignal(v); setPage(1); }}
              selectedState={selectedState}
              selectedCity={selectedCity}
            />
          ) : (
            <div 
              className="opacity-50 cursor-pointer relative group"
              onClick={() => setUpgradePromptType('advanced_filters')}
            >
              <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
                <Badge variant="secondary" className="text-xs">Pro Feature</Badge>
              </div>
              <EnforcementSignalsFilter
                selectedSignal={null}
                onSignalChange={() => {}}
                selectedState={selectedState}
                selectedCity={selectedCity}
              />
            </div>
          )}
          
          {/* Pressure Level - Gated behind advanced_filters */}
          {hasAdvancedFilters ? (
            <PressureLevelFilter
              openViolationsOnly={openViolationsOnly}
              onOpenViolationsChange={(v) => { setOpenViolationsOnly(v); setPage(1); }}
              multipleViolationsOnly={multipleViolationsOnly}
              onMultipleViolationsChange={(v) => { setMultipleViolationsOnly(v); setPage(1); }}
              repeatOffenderOnly={repeatOffenderOnly}
              onRepeatOffenderChange={(v) => { setRepeatOffenderOnly(v); setPage(1); }}
            />
          ) : (
            <div 
              className="opacity-50 cursor-pointer relative group"
              onClick={() => setUpgradePromptType('advanced_filters')}
            >
              <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
                <Badge variant="secondary" className="text-xs">Pro Feature</Badge>
              </div>
              <PressureLevelFilter
                openViolationsOnly={false}
                onOpenViolationsChange={() => {}}
                multipleViolationsOnly={false}
                onMultipleViolationsChange={() => {}}
                repeatOffenderOnly={false}
                onRepeatOffenderChange={() => {}}
              />
            </div>
          )}
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
            onSignalChange={(v) => { setSelectedSignal(v); setPage(1); }}
            openViolationsOnly={openViolationsOnly}
            onOpenViolationsChange={(v) => { setOpenViolationsOnly(v); setPage(1); }}
            multipleViolationsOnly={multipleViolationsOnly}
            onMultipleViolationsChange={(v) => { setMultipleViolationsOnly(v); setPage(1); }}
            repeatOffenderOnly={repeatOffenderOnly}
            onRepeatOffenderChange={(v) => { setRepeatOffenderOnly(v); setPage(1); }}
            onClearFilters={handleClearFilters}
            activeFilterCount={activeFilterCount}
          />
        </div>
        
        {/* Freshness indicator + View Toggle */}
        <div className="flex items-center justify-between px-3 pb-2">
          <FreshnessIndicator />
          <div className="flex bg-muted rounded-lg p-0.5">
            <Button
              variant={mobileView === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3 rounded-md"
              onClick={() => setMobileView('list')}
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
            <Button
              variant={mobileView === 'map' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3 rounded-md"
              onClick={() => setMobileView('map')}
            >
              <MapIcon className="h-4 w-4 mr-1" />
              Map
            </Button>
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
          <div className="absolute top-4 right-4 z-[1001] flex gap-2">
            <Button
              onClick={handleGenerateInsights}
              disabled={isGeneratingInsights || properties.length === 0}
              variant="secondary"
              size="sm"
              className="shadow-lg"
            >
              {isGeneratingInsights ? 'Analyzing...' : 'Generate Insights'}
            </Button>
            <Button
              onClick={() => setShowBulkDeleteDialog(true)}
              variant="destructive"
              size="sm"
              className="shadow-lg"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Bulk Delete
            </Button>
          </div>
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
                      : viewMode === 'violation'
                      ? `${violationsWithProperty.length} violations`
                      : `${totalCount} properties`}
                  </span>
                  <ViewModeToggle value={viewMode} onChange={setViewMode} />
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
            ) : viewMode === 'violation' ? (
              <ViolationListView
                violations={violationsWithProperty}
                onPropertyClick={setSelectedPropertyId}
              />
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
                onClick={() => setPage(p => Math.max(1, p - 1))}
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
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
                className="flex-1 overflow-y-auto overscroll-contain touch-pan-y"
                style={{ paddingBottom: 'calc(var(--bottom-nav-height) + 4rem)' }}
              >
                <div className="divide-y">
                  {mappedProperties.map((property) => (
                    <MobilePropertyCard
                      key={property.id}
                      property={property}
                      isSelected={selectedIds.includes(property.id)}
                      onToggleSelect={handleToggleSelect}
                      onClick={() => setSelectedPropertyId(property.id)}
                    />
                  ))}
                </div>
                
                {/* Mobile Pagination - inside scroll area */}
                <div className="flex items-center justify-between px-4 py-3 border-t bg-background mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 min-h-[44px] px-3 gap-1"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages || 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 min-h-[44px] px-3 gap-1"
                    onClick={() => setPage(p => Math.min(totalPages || 1, p + 1))}
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

      {/* Add to List Dialog */}
      <AddToListDialog
        open={showAddToListDialog}
        onOpenChange={setShowAddToListDialog}
        propertyIds={selectedIds}
        onSuccess={() => {
          setSelectedIds([]);
          setShowAddToListDialog(false);
        }}
      />

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        onSuccess={() => {
          refetch();
          setShowBulkDeleteDialog(false);
        }}
      />

      {/* Upgrade Prompt for Gated Features */}
      <UpgradePrompt
        open={!!upgradePromptType}
        onOpenChange={(open) => !open && setUpgradePromptType(null)}
        limitType={upgradePromptType || 'advanced_filters'}
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
      </div>
    </AppLayout>
  );
}

export default Leads;
