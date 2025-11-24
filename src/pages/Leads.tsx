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
import { JurisdictionFilter } from "@/components/leads/JurisdictionFilter";
import { generateInsights } from "@/services/insights";

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
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
  
  // Data state
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [snapScoreMin, setSnapScoreMin] = useState(0);
  const [lastSeenDays, setLastSeenDays] = useState<number | null>(null);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState<string | null>(null);

  // UI state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [showAddToListDialog, setShowAddToListDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  // Fetch properties from database
  async function fetchProperties() {
    setLoading(true);
    try {
      // Fetch properties with their violations and jurisdiction
      const { data: propertiesData, error: propertiesError } = await supabase
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
        .order('created_at', { ascending: false });

      if (propertiesError) throw propertiesError;

      setProperties(propertiesData || []);
      
      toast({
        title: "Properties Loaded",
        description: `Loaded ${propertiesData?.length || 0} properties from database`,
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

      // Snap score filter
      if (snapScoreMin > 0 && (property.snap_score || 0) < snapScoreMin) {
        return false;
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

      // City filter
      if (selectedCities.length > 0 && !selectedCities.includes(property.city)) {
        return false;
      }

      // Jurisdiction filter
      if (selectedJurisdictionId && (property as any).jurisdiction_id !== selectedJurisdictionId) {
        return false;
      }

      return true;
    });
  }, [properties, searchQuery, snapScoreMin, lastSeenDays, selectedCities, selectedJurisdictionId]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSnapScoreMin(0);
    setLastSeenDays(null);
    setSelectedCities([]);
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
    
    toast({
      title: "Export Started",
      description: `Exporting ${selectedIds.length} properties to CSV...`,
    });
    
    // TODO: Implement CSV export
    setSelectedIds([]);
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
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        snapScoreMin={snapScoreMin}
        lastSeenDays={lastSeenDays}
        selectedCities={selectedCities}
        selectedJurisdiction={selectedJurisdictionId}
        propertyCount={filteredProperties.length}
        onClearFilters={handleClearFilters}
      />
      
      <div className="flex gap-4 px-4 py-3 border-b bg-background">
        <div className="w-64">
          <JurisdictionFilter
            value={selectedJurisdictionId}
            onChange={setSelectedJurisdictionId}
          />
        </div>
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
