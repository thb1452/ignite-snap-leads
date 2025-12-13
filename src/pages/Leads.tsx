import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LeadsMap } from "@/components/leads/LeadsMap";
import { FilterBar } from "@/components/leads/FilterBar";
import { FilterControls } from "@/components/leads/FilterControls";
import { BulkActionBar } from "@/components/leads/BulkActionBar";
import { PropertyDetailPanel } from "@/components/leads/PropertyDetailPanel";
import { AddToListDialog } from "@/components/leads/AddToListDialog";
import { BulkDeleteDialog } from "@/components/leads/BulkDeleteDialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { VirtualizedPropertyList } from "@/components/leads/VirtualizedPropertyList";
import { LocationFilter } from "@/components/leads/LocationFilter";
import { generateInsights } from "@/services/insights";
import { useDemoCredits } from "@/hooks/useDemoCredits";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useOnboarding } from "@/hooks/useOnboarding";
import { UpgradePrompt } from "@/components/subscription/UpgradePrompt";
import { useSubscription } from "@/hooks/useSubscription";
import { exportFilteredCsv } from "@/services/export";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
  // NOTE: description and raw_description are NEVER included for legal safety
}

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  updated_at: string | null;
  violations: Violation[];
}

function Leads() {
  const { toast } = useToast();
  const { showOnboarding, setShowOnboarding, markOnboardingComplete } = useOnboarding();
  const { plan, checkLimit } = useSubscription();

  // Data state
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeLimitType, setUpgradeLimitType] = useState<'csv_export' | 'skip_trace'>('csv_export');

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [snapScoreMin, setSnapScoreMin] = useState(0);
  const [lastSeenDays, setLastSeenDays] = useState<number | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
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

  // Fetch properties from database in batches to overcome 1000 row limit
  async function fetchProperties() {
    setLoading(true);
    try {
      let allProperties: Property[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from('properties')
          .select(`
            id,
            address,
            city,
            state,
            zip,
            latitude,
            longitude,
            snap_score,
            snap_insight,
            photo_url,
            updated_at,
            jurisdiction_id,
            violations (
              id,
              violation_type,
              description,
              status,
              opened_date,
              days_open,
              case_id
            )
          `)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          allProperties = [...allProperties, ...batch];
          from += batchSize;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setProperties(allProperties);
      
      toast({
        title: "Properties Loaded",
        description: `Loaded ${allProperties.length} properties from database`,
      });
    } catch (error) {
      console.error("Error loading properties:", error);
      toast({
        title: "Error",
        description: "Failed to load properties",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProperties();
  }, []);

  // Filter properties
  const filteredProperties = useMemo(() => {
    return properties.filter(property => {
      // Search filter
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        if (
          !property.address.toLowerCase().includes(search) &&
          !property.city.toLowerCase().includes(search) &&
          !property.zip.includes(search)
        ) {
          return false;
        }
      }

      // Snap score filter - only filter when threshold is meaningful
      if (snapScoreMin > 0) {
        const score = property.snap_score ?? 0;
        if (score < snapScoreMin) {
          return false;
        }
      }

      // Last seen filter
      if (lastSeenDays !== null && property.updated_at) {
        const daysSince = Math.floor(
          (Date.now() - new Date(property.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSince > lastSeenDays) {
          return false;
        }
      }

      // City filter (from property data, not jurisdiction)
      if (selectedCity && property.city !== selectedCity) {
        return false;
      }

      // Jurisdiction filter
      if (selectedJurisdictionId && (property as any).jurisdiction_id !== selectedJurisdictionId) {
        return false;
      }

      return true;
    });
  }, [properties, searchQuery, snapScoreMin, lastSeenDays, selectedCity, selectedCounty, selectedJurisdictionId]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSnapScoreMin(0);
    setLastSeenDays(null);
    setSelectedCity(null);
    setSelectedCounty(null);
    setSelectedSource(null);
    setSelectedJurisdictionId(null);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.length === filteredProperties.length ? [] : filteredProperties.map(p => p.id)
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

    // Check if user can export
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

      // Use filters from current view
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

      // Refresh properties to show insights
      await fetchProperties();
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
        onSearchChange={setSearchQuery}
        snapScoreMin={snapScoreMin}
        lastSeenDays={lastSeenDays}
        selectedCity={selectedCity}
        selectedCounty={selectedCounty}
        selectedJurisdiction={selectedJurisdictionId}
        propertyCount={filteredProperties.length}
        onClearFilters={handleClearFilters}
      />
      
      <div className="flex flex-wrap gap-4 px-4 py-3 border-b bg-background">
        <LocationFilter
          selectedJurisdiction={selectedJurisdictionId}
          selectedCity={selectedCity}
          selectedCounty={selectedCounty}
          onJurisdictionChange={setSelectedJurisdictionId}
          onCityChange={setSelectedCity}
          onCountyChange={setSelectedCounty}
        />
        <FilterControls
          snapScoreMin={snapScoreMin}
          onSnapScoreChange={setSnapScoreMin}
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
            properties={filteredProperties}
            onPropertyClick={setSelectedPropertyId}
            selectedPropertyId={selectedPropertyId || undefined}
          />
        </div>

        {/* Property List - Right Side */}
        <div className="w-[40%] flex flex-col relative">
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading properties...
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No properties found
              </div>
            ) : (
              <VirtualizedPropertyList
                properties={filteredProperties}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onPropertyClick={setSelectedPropertyId}
              />
            )}
          </div>

          <BulkActionBar
            selectedCount={selectedIds.length}
            totalCount={filteredProperties.length}
            allSelected={selectedIds.length === filteredProperties.length && filteredProperties.length > 0}
            onToggleSelectAll={handleToggleSelectAll}
            onSkipTrace={handleExportCSV}
            onView={() => setShowAddToListDialog(true)}
          />
        </div>
      </div>

      {/* Property Detail Panel */}
      {selectedPropertyId && (
        <PropertyDetailPanel
          property={properties.find(p => p.id === selectedPropertyId) || null}
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
          fetchProperties();
          setShowBulkDeleteDialog(false);
        }}
      />
    </div>
  );
}

export default Leads;
