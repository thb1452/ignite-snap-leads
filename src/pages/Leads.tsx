import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { LeadsMap } from "@/components/leads/LeadsMap";
import { FilterBar } from "@/components/leads/FilterBar";
import { FilterControls } from "@/components/leads/FilterControls";
import { BulkActionBar } from "@/components/leads/BulkActionBar";
import { PropertyDetailPanel } from "@/components/leads/PropertyDetailPanel";
import { AddToListDialog } from "@/components/leads/AddToListDialog";
import { BulkDeleteDialog } from "@/components/leads/BulkDeleteDialog";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { VirtualizedPropertyList } from "@/components/leads/VirtualizedPropertyList";
import { LocationFilter } from "@/components/leads/LocationFilter";
import { generateInsights } from "@/services/insights";
import { useDemoCredits } from "@/hooks/useDemoCredits";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useOnboarding } from "@/hooks/useOnboarding";
import { UpgradePrompt } from "@/components/subscription/UpgradePrompt";
import { useSubscription } from "@/hooks/useSubscription";
import { exportFilteredCsv } from "@/services/export";
import { useProperties } from "@/hooks/useProperties";
import { useMapMarkers } from "@/hooks/useMapMarkers";

const PAGE_SIZE = 50;

function Leads() {
  const { toast } = useToast();
  const { showOnboarding, setShowOnboarding, markOnboardingComplete } = useOnboarding();
  const { plan, checkLimit } = useSubscription();

  // Pagination state
  const [page, setPage] = useState(1);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [snapScoreMin, setSnapScoreMin] = useState(0);
  const [lastSeenDays, setLastSeenDays] = useState<number | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState<string | null>(null);
  
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

  // Build filters object for the hook
  const filters = useMemo(() => ({
    search: searchQuery || undefined,
    cities: selectedCity ? [selectedCity] : undefined,
    state: selectedState || undefined,
    county: selectedCounty || undefined,
    jurisdictionId: selectedJurisdictionId || undefined,
    snapScoreRange: snapScoreMin > 0 ? [snapScoreMin, 100] as [number, number] : undefined,
  }), [searchQuery, selectedCity, selectedState, selectedCounty, selectedJurisdictionId, snapScoreMin]);

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
    setSelectedCounty(null);
    setSelectedSource(null);
    setSelectedJurisdictionId(null);
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
        jurisdictionId: selectedJurisdictionId || undefined,
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

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(q) => { setSearchQuery(q); setPage(1); }}
        snapScoreMin={snapScoreMin}
        lastSeenDays={lastSeenDays}
        selectedCity={selectedCity}
        selectedState={selectedState}
        selectedCounty={selectedCounty}
        selectedJurisdiction={selectedJurisdictionId}
        propertyCount={totalCount}
        onClearFilters={handleClearFilters}
      />
      
      <div className="flex flex-wrap gap-4 px-4 py-3 border-b bg-background">
        <LocationFilter
          selectedJurisdiction={selectedJurisdictionId}
          selectedCity={selectedCity}
          selectedState={selectedState}
          selectedCounty={selectedCounty}
          onJurisdictionChange={(j) => { setSelectedJurisdictionId(j); setPage(1); }}
          onCityChange={(c) => { setSelectedCity(c); setPage(1); }}
          onStateChange={(s) => { setSelectedState(s); setPage(1); }}
          onCountyChange={(c) => { setSelectedCounty(c); setPage(1); }}
        />
        <FilterControls
          snapScoreMin={snapScoreMin}
          onSnapScoreChange={(v) => { setSnapScoreMin(v); setPage(1); }}
          lastSeenDays={lastSeenDays}
          onLastSeenChange={setLastSeenDays}
          selectedSource={selectedSource}
          onSourceChange={setSelectedSource}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
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

      {/* Property Detail Panel */}
      {selectedPropertyId && (
        <PropertyDetailPanel
          property={mappedProperties.find(p => p.id === selectedPropertyId) || null}
          open={!!selectedPropertyId}
          onOpenChange={(open) => !open && setSelectedPropertyId(null)}
        />
      )}

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
