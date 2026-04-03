import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSavedProperties } from "@/hooks/useSavedProperties";
import { exportFilteredCsv, getExportErrorToast } from "@/services/export";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradePrompt, type ExportContext } from "@/components/subscription/UpgradePrompt";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { TrialExportGate } from "@/components/trial/TrialExportGate";
import { supabase } from "@/integrations/supabase/externalClient";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Heart,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  AlertTriangle,
} from "lucide-react";

const PAGE_SIZE = 50;

export default function SavedProperties() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { savedIds, isLoading: savedLoading, toggleSaved } = useSavedProperties();
  const { plan, usage, getRemainingCount, refetch: refetchSubscription, hasActiveSubscription } = useSubscription();
  const {
    isOnTrial,
    hasTrialExpired,
    trialExportsRemaining,
    trialTier,
    trialEndsAt,
    refetch: refetchTrial,
  } = useTrialStatus();

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState<"page" | "custom">("page");
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [exportContextData, setExportContextData] = useState<ExportContext | undefined>(undefined);
  const [trialGateOpen, setTrialGateOpen] = useState(false);
  const [trialGateType, setTrialGateType] = useState<'exhausted' | 'expired'>('exhausted');

  // Split checkbox dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setShowCustomInput(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (showCustomInput && inputRef.current) inputRef.current.focus();
  }, [showCustomInput]);

  // Fetch property details for saved IDs
  const paginatedIds = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return savedIds.slice(start, start + PAGE_SIZE);
  }, [savedIds, page]);

  const totalPages = Math.ceil(savedIds.length / PAGE_SIZE);

  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ["saved-properties-details", paginatedIds],
    queryFn: async () => {
      if (paginatedIds.length === 0) return [];
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, city, state, zip, snap_score, total_violations, open_violations, enforcement_type, opportunity_class")
        .in("id", paginatedIds);
      if (error) throw error;
      return data || [];
    },
    enabled: paginatedIds.length > 0,
    staleTime: 30000,
  });

  const isLoading = savedLoading || propertiesLoading;
  const exportRemaining = getRemainingCount("exports");
  const isOverExportLimit = exportRemaining !== null && selectedIds.length > exportRemaining;

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setSelectMode("page");
  };

  const handleToggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.length === properties.length ? [] : properties.map(p => p.id)
    );
    setSelectMode("page");
  };

  const handleSelectVisible = () => {
    setSelectedIds(properties.map(p => p.id));
    setSelectMode("page");
    setDropdownOpen(false);
  };

  const handleSelectCustomAmount = (amount: number) => {
    // Select first N from all savedIds
    const idsToSelect = savedIds.slice(0, amount);
    setSelectedIds(idsToSelect);
    setSelectMode("custom");
    setDropdownOpen(false);
    toast({
      title: "Selection Updated",
      description: `Selected ${idsToSelect.length.toLocaleString()} properties`,
    });
  };

  const handleCustomConfirm = () => {
    const num = parseInt(customAmount, 10);
    if (num > 0) {
      handleSelectCustomAmount(num);
    }
    setCustomAmount("");
    setShowCustomInput(false);
  };

  const handleRemoveSelected = () => {
    selectedIds.forEach(id => toggleSaved(id));
    setSelectedIds([]);
    setSelectMode("page");
    toast({ title: "Removed", description: `Removed ${selectedIds.length} properties from saved` });
  };

  const handleExport = async () => {
    if (selectedIds.length === 0) {
      toast({ title: "No Selection", description: "Select properties to export", variant: "destructive" });
      return;
    }

    // Trial gating
    if (isOnTrial || hasTrialExpired) {
      if (hasTrialExpired) { setTrialGateType('expired'); setTrialGateOpen(true); return; }
      if (trialExportsRemaining <= 0) { setTrialGateType('exhausted'); setTrialGateOpen(true); return; }
    }

    setIsExporting(true);
    try {
      await exportFilteredCsv({ propertyIds: selectedIds, expectedPropertyCount: selectedIds.length });
      toast({ title: "Export Complete", description: `Exported ${selectedIds.length} properties` });
      setSelectedIds([]);
      setSelectMode("page");
      await refetchSubscription();
      if (isOnTrial) await refetchTrial();
    } catch (error: unknown) {
      const t = getExportErrorToast(error);
      toast({ title: t.title, description: t.description, variant: t.variant });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-6xl space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/lists")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500 fill-current" />
            <h1 className="text-xl font-bold">My Saved Properties</h1>
          </div>
          <span className="text-sm text-muted-foreground">
            {savedIds.length.toLocaleString()} {savedIds.length === 1 ? "property" : "properties"}
          </span>
        </div>

        {/* Action bar */}
        {selectedIds.length > 0 && (
          <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg">
            {/* Export limit warning */}
            {isOverExportLimit && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  You have {exportRemaining!.toLocaleString()} exports remaining this month. Reduce your selection or upgrade your plan.
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{selectedIds.length.toLocaleString()} properties selected</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleRemoveSelected}>
                <Trash2 className="h-4 w-4 mr-1" /> Unsave
              </Button>
              <Button size="sm" onClick={handleExport} disabled={isExporting || isOverExportLimit}>
                {isExporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Export
              </Button>
            </div>
          </div>
        )}

        {/* Properties list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold">No saved properties</h3>
            <p className="text-muted-foreground mt-1">
              Tap the heart icon on any property to save it here.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/leads")}>
              Browse Properties
            </Button>
          </div>
        ) : (
          <>
            {/* Split checkbox select control */}
            <div className="flex items-center gap-2 px-1 relative" ref={dropdownRef}>
              <div className="flex items-center">
                <Checkbox
                  checked={selectedIds.length === properties.length && properties.length > 0}
                  onCheckedChange={handleToggleSelectAll}
                />
                <button
                  onClick={() => {
                    setDropdownOpen(!dropdownOpen);
                    setShowCustomInput(false);
                  }}
                  className="ml-0.5 p-0.5 rounded hover:bg-muted transition-colors"
                  aria-label="Selection options"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <span className="text-sm text-muted-foreground">
                {selectedIds.length > 0
                  ? `${selectedIds.length.toLocaleString()} properties selected`
                  : `Select all (${properties.length})`}
              </span>

              {/* Dropdown menu */}
              {dropdownOpen && (
                <div className="absolute top-full mt-1 left-0 bg-popover border border-border rounded-md shadow-md py-1 min-w-[200px] z-50">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={handleSelectVisible}
                  >
                    Select Visible
                    <span className="text-muted-foreground ml-1">({properties.length})</span>
                  </button>

                  {!showCustomInput ? (
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => setShowCustomInput(true)}
                    >
                      Custom Amount
                    </button>
                  ) : (
                    <div className="px-3 py-2 flex items-center gap-2">
                      <Input
                        ref={inputRef}
                        type="number"
                        min={1}
                        placeholder="Enter number..."
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCustomConfirm();
                          if (e.key === "Escape") {
                            setShowCustomInput(false);
                            setCustomAmount("");
                          }
                        }}
                        className="h-7 text-sm w-28"
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleCustomConfirm}
                        disabled={!customAmount || parseInt(customAmount, 10) <= 0}
                      >
                        Select
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {properties.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.includes(p.id)}
                      onCheckedChange={() => handleToggleSelect(p.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.address}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.city}, {p.state} {p.zip}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.snap_score != null && (
                        <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {p.snap_score}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {p.open_violations ?? 0} open
                      </span>
                      <button
                        onClick={() => toggleSaved(p.id)}
                        className="p-1 text-red-500 hover:text-red-600"
                        aria-label="Unsave property"
                      >
                        <Heart className="h-4 w-4 fill-current" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="outline" size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline" size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        <TrialExportGate
          open={trialGateOpen}
          onOpenChange={setTrialGateOpen}
          type={trialGateType}
          trialTier={trialTier}
          trialEndsAt={trialEndsAt}
        />
        <UpgradePrompt
          open={showUpgradePrompt}
          onOpenChange={setShowUpgradePrompt}
          limitType="exports"
          currentPlan={plan?.name}
          exportContext={exportContextData}
        />
      </div>
    </AppLayout>
  );
}
