import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
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
import { Trash2, ChevronLeft, ChevronRight, Search, X, Map, List } from "lucide-react";
import { VirtualizedPropertyList } from "@/components/leads/VirtualizedPropertyList";
import { EnforcementAreaFilter } from "@/components/leads/EnforcementAreaFilter";
import { EnforcementSignalsFilter } from "@/components/leads/EnforcementSignalsFilter";
import { PressureLevelFilter } from "@/components/leads/PressureLevelFilter";
import { ScoreAndTimeFilter } from "@/components/leads/ScoreAndTimeFilter";
import { generateInsights } from "@/services/insights";
import { useDemoCredits } from "@/hooks/useDemoCredits";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useOnboarding } from "@/hooks/useOnboarding";
import { UpgradePrompt } from "@/components/subscription/UpgradePrompt";
import { useSubscription } from "@/hooks/useSubscription";
import { exportFilteredCsv } from "@/services/export";
import { useProperties } from "@/hooks/useProperties";
import { useMapMarkers } from "@/hooks/useMapMarkers";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const PAGE_SIZE = 50;

function Leads() {
  const { toast } = useToast();
  const { showOnboarding, setShowOnboarding, markOnboardingComplete } = useOnboarding();
  const { plan, checkLimit } = useSubscription();

  // Pagination state
  const [page, setPage] = useState(1);

  // Enforcement Area filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  
  // Score and time filter state
  const [snapScoreMin, setSnapScoreMin] = useState(0);
  const [lastSeenDays, setLastSeenDays] = useState<number | null>(null);
  
  // Enforcement signals filter state
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  
  // Pressure level filter state
  const [openViolationsOnly, setOpenViolationsOnly] = useState(false);
  const [multipleViolationsOnly, setMultipleViolationsOnly] = useState(false);
  const [repeatOffenderOnly, setRepeatOffenderOnly] = useState(false);
  
  // Mobile view state
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  
  // Demo credits hook
  const { isDemoMode, isAdmin } = useDemoCredits();

  // UI state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [showAddToListDialog, setShowAddToListDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeLimitType, setUpgradeLimitType] = useState<'csv_export' | 'skip_trace'>('csv_export');

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (snapScoreMin > 0) count++;
    if (lastSeenDays !== null) count++;
    if (selectedCity) count++;
    if (selectedState) count++;
    if (selectedSignal) count++;
    if (openViolationsOnly) count++;
    if (multipleViolationsOnly) count++;
    if (repeatOffenderOnly) count++;
    return count;
  }, [snapScoreMin, lastSeenDays, selectedCity, selectedState, selectedSignal, openViolationsOnly, multipleViolationsOnly, repeatOffenderOnly]);

  // Build filters object for the hook - only include truthy values
  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};
    
    if (searchQuery?.trim()) f.search = searchQuery.trim();
    if (selectedCity) f.cities = [selectedCity];
    if (selectedState) f.state = selectedState;
    if (snapScoreMin > 0) f.snapScoreRange = [snapScoreMin, 100] as [number, number];
    if (lastSeenDays !== null && lastSeenDays > 0) f.lastSeenDays = lastSeenDays;
    if (selectedSignal) f.violationType = selectedSignal;
    
    // Pressure level filters
    if (openViolationsOnly) f.openViolationsOnly = true;
    if (multipleViolationsOnly) f.multipleViolationsOnly = true;
    if (repeatOffenderOnly) f.repeatOffenderOnly = true;
    
    console.log("[Leads] Active filters:", JSON.stringify(f));
    return f;
  }, [searchQuery, selectedCity, selectedState, snapScoreMin, lastSeenDays, selectedSignal, openViolationsOnly, multipleViolationsOnly, repeatOffenderOnly]);

  // Use paginated properties hook for the list
  const { data, isLoading, error, refetch } = useProperties(page, PAGE_SIZE, filters);
  
  // Use lightweight markers query for the map (filtered same as list)
  const { data: mapMarkers = [], error: mapError } = useMapMarkers(filters);
  
  // Log any errors
  if (error) console.error("[Leads] Properties error:", error);
  if (mapError) console.error("[Leads] Map markers error:", mapError);
  
  const properties = data?.data ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSnapScoreMin(0);
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

    const canExport = await checkLimit('csv_export');
    if (!canExport) {
      setUpgradeLimitType('csv_export');
      setShowUpgradePrompt(true);
      return;
    }

    try {
      toast({
        title: "Export Started",
        description: `Exporting ${selectedIds.length} properties to CSV...`,
      });

      await exportFilteredCsv({
        city: selectedCity || undefined,
        minScore: snapScoreMin,
      });

      toast({
        title: "Export Complete",
        description: `Successfully exported ${selectedIds.length} properties`,
      });

      setSelectedIds([]);
    } catch (error: any) {
      console.error('[Leads] Export error:', error);

      if (error.message === 'EXPORT_LIMIT_EXCEEDED') {
        setUpgradeLimitType('csv_export');
        setShowUpgradePrompt(true);
        return;
      }

      toast({
        title: "Export Failed",
        description: error.message || "Failed to export properties",
        variant: "destructive",
      });
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
  const mappedProperties = properties.map(p => ({
    ...p,
    violations: [] as any[],
  }));

  const selectedProperty = mappedProperties.find(p => p.id === selectedPropertyId) || null;

  return (
    <div className="flex flex-col h-screen">
      <OnboardingFlow
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        onComplete={markOnboardingComplete}
      />

      <UpgradePrompt
        open={showUpgradePrompt}
        onOpenChange={setShowUpgradePrompt}
        limitType={upgradeLimitType}
        currentPlan={plan?.name}
      />

      {/* DESKTOP: Filter Bar */}
      <div className="hidden md:block">
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={(q) => { setSearchQuery(q); setPage(1); }}
          snapScoreMin={snapScoreMin}
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
          
          {/* Score and Time */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Score & Recency
            </span>
            <ScoreAndTimeFilter
              snapScoreMin={snapScoreMin}
              onSnapScoreChange={(v) => { setSnapScoreMin(v); setPage(1); }}
              lastSeenDays={lastSeenDays}
              onLastSeenChange={setLastSeenDays}
            />
          </div>
          
          {/* Enforcement Signals */}
          <EnforcementSignalsFilter
            selectedSignal={selectedSignal}
            onSignalChange={setSelectedSignal}
            selectedState={selectedState}
            selectedCity={selectedCity}
          />
          
          {/* Pressure Level */}
          <PressureLevelFilter
            openViolationsOnly={openViolationsOnly}
            onOpenViolationsChange={setOpenViolationsOnly}
            multipleViolationsOnly={multipleViolationsOnly}
            onMultipleViolationsChange={setMultipleViolationsOnly}
            repeatOffenderOnly={repeatOffenderOnly}
            onRepeatOffenderChange={setRepeatOffenderOnly}
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
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9 h-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
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
            snapScoreMin={snapScoreMin}
            onSnapScoreChange={(v) => { setSnapScoreMin(v); setPage(1); }}
            lastSeenDays={lastSeenDays}
            onLastSeenChange={setLastSeenDays}
            selectedSignal={selectedSignal}
            onSignalChange={setSelectedSignal}
            openViolationsOnly={openViolationsOnly}
            onOpenViolationsChange={setOpenViolationsOnly}
            multipleViolationsOnly={multipleViolationsOnly}
            onMultipleViolationsChange={setMultipleViolationsOnly}
            repeatOffenderOnly={repeatOffenderOnly}
            onRepeatOffenderChange={setRepeatOffenderOnly}
            onClearFilters={handleClearFilters}
            activeFilterCount={activeFilterCount}
          />
        </div>
        
        {/* Property count + View Toggle */}
        <div className="flex items-center justify-between px-3 pb-3">
          <span className="text-sm font-medium text-muted-foreground">
            {totalCount.toLocaleString()} properties
          </span>
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
              <Map className="h-4 w-4 mr-1" />
              Map
            </Button>
          </div>
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
          {/* Export Button Above List */}
          {properties.length > 0 && (
            <div className="px-4 py-2 border-b bg-background flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length > 0
                  ? `${selectedIds.length} selected`
                  : `${totalCount} properties`}
              </span>
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
                Export to CSV
              </Button>
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
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({totalCount} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <BulkActionBar
            selectedCount={selectedIds.length}
            totalCount={properties.length}
            allSelected={selectedIds.length === properties.length && properties.length > 0}
            onToggleSelectAll={handleToggleSelectAll}
            onSkipTrace={handleExportCSV}
            onView={() => setShowAddToListDialog(true)}
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
          <div className="flex-1 flex flex-col overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading properties...
              </div>
            ) : properties.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No properties found
              </div>
            ) : (
              <ScrollArea className="flex-1">
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
              </ScrollArea>
            )}

            {/* Mobile Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-background">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 min-h-[44px] px-4"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 min-h-[44px] px-4"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DESKTOP: Property Detail Panel (Sidebar) */}
      <div className="hidden md:block">
        {selectedPropertyId && (
          <PropertyDetailPanel
            property={selectedProperty}
            open={!!selectedPropertyId}
            onOpenChange={(open) => !open && setSelectedPropertyId(null)}
          />
        )}
      </div>

      {/* MOBILE: Property Detail Sheet (Full-screen from bottom) */}
      <div className="md:hidden">
        <MobilePropertyDetailSheet
          property={selectedProperty}
          open={!!selectedPropertyId}
          onOpenChange={(open) => !open && setSelectedPropertyId(null)}
        />
      </div>

      {/* Add to List Dialog */}
      <AddToListDialog
        open={showAddToListDialog}
        onOpenChange={setShowAddToListDialog}
        propertyIds={selectedIds}
        userLists={[]}
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
    </div>
  );
}

export default Leads;
