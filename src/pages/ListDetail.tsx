import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useListProperties, useRemoveFromList, useUserLists } from "@/hooks/useLists";
import { exportFilteredCsv, getExportErrorToast, EXPORT_LIMIT_EXCEEDED } from "@/services/export";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradePrompt, type ExportContext } from "@/components/subscription/UpgradePrompt";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { TrialExportGate } from "@/components/trial/TrialExportGate";
import { supabase } from "@/integrations/supabase/externalClient";
import {
  ArrowLeft,
  Download,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PAGE_SIZE = 50;

export function ListDetail() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { checkLimit, refetch: refetchSubscription, plan, usage, getRemainingCount, hasActiveSubscription } = useSubscription();
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
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [exportContextData, setExportContextData] = useState<ExportContext | undefined>(undefined);
  const pendingExportIdsRef = useRef<string[]>([]);
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

  // Fetch list details
  const { data: lists = [] } = useUserLists();
  const currentList = lists.find((l) => l.id === listId);

  // Fetch properties in list
  const { data, isLoading, refetch } = useListProperties(listId || null, page, PAGE_SIZE);
  const properties = data?.items || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const removeFromListMutation = useRemoveFromList();

  const allSelected = properties.length > 0 && selectedIds.length === properties.length;
  const exportRemaining = getRemainingCount("exports");
  const isOverExportLimit = exportRemaining !== null && selectedIds.length > 0 && selectedIds.length > exportRemaining;

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setSelectMode("page");
  };

  const handleToggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : properties.map((p) => p.id));
    setSelectMode("page");
  };

  const handleSelectVisible = () => {
    setSelectedIds(properties.map((p) => p.id));
    setSelectMode("page");
    setDropdownOpen(false);
  };

  const handleSelectCustomAmount = useCallback(async (amount: number) => {
    setSelectMode("custom");
    setDropdownOpen(false);
    try {
      // Fetch first N property IDs from the list using cursor pagination
      const allIds: string[] = [];
      const BATCH = 1000;
      let lastId: string | null = null;
      let hasMore = true;

      while (hasMore && allIds.length < amount) {
        let query = supabase
          .from("list_properties")
          .select("id, property_id")
          .eq("list_id", listId!)
          .order("id", { ascending: true })
          .limit(Math.min(BATCH, amount - allIds.length));

        if (lastId) {
          query = query.gt("id", lastId);
        }

        const { data: batch, error } = await query;
        if (error) throw new Error(`Failed to fetch property IDs: ${error.message}`);
        if (!batch || batch.length === 0) {
          hasMore = false;
          break;
        }

        allIds.push(...batch.map((r) => r.property_id).filter(Boolean));
        lastId = batch[batch.length - 1].id;
        hasMore = batch.length === BATCH;
      }

      setSelectedIds(allIds);
      toast({
        title: "Selection Updated",
        description: `Selected ${allIds.length.toLocaleString()} properties`,
      });
    } catch (err: any) {
      console.error("[ListDetail] Custom amount selection error:", err);
      toast({
        title: "Selection Failed",
        description: "Could not fetch property IDs. Please try again.",
        variant: "destructive",
      });
      setSelectMode("page");
    }
  }, [listId, toast]);

  const handleCustomConfirm = () => {
    const num = parseInt(customAmount, 10);
    if (num > 0) {
      handleSelectCustomAmount(num);
    }
    setCustomAmount("");
    setShowCustomInput(false);
  };

  // Core export logic — accepts IDs and count directly
  const executeExport = useCallback(async (ids: string[], count: number) => {
    setIsExporting(true);
    setExportProgress(`Exporting ${count.toLocaleString()} properties...`);

    try {
      await exportFilteredCsv({
        propertyIds: ids,
        expectedPropertyCount: count,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Exported ${count.toLocaleString()} properties`,
      });

      setSelectedIds([]);
      setSelectMode("page");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      if (msg === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
        setTrialGateType('exhausted');
        setTrialGateOpen(true);
        return;
      }
      if (msg === "TRIAL_EXPIRED") {
        setTrialGateType('expired');
        setTrialGateOpen(true);
        return;
      }
      if (msg === EXPORT_LIMIT_EXCEEDED) {
        const t = getExportErrorToast(error);
        toast({ title: t.title, description: t.description, variant: t.variant });
        const remaining = getRemainingCount('exports') ?? 0;
        const used = usage?.exports_count ?? 0;
        const max = plan?.max_monthly_exports ?? 0;
        pendingExportIdsRef.current = ids;
        setExportContextData({
          requestedCount: count,
          remainingCount: remaining,
          usedCount: used,
          maxCount: max,
          onPartialExport: handlePartialExport,
        });
        setShowUpgradePrompt(true);
        return;
      }
      const t = getExportErrorToast(error);
      toast({ title: t.title, description: t.description, variant: t.variant });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      // Refresh trial status after any export attempt
      if (isOnTrial) refetchTrial();
    }
  }, [refetchSubscription, refetchTrial, isOnTrial, toast, getRemainingCount, usage, plan]);

  // Partial export handler — called from UpgradePrompt
  const handlePartialExport = useCallback(async (count: number) => {
    const ids = pendingExportIdsRef.current.slice(0, count);
    if (ids.length === 0) return;
    await executeExport(ids, ids.length);
  }, [executeExport]);

  const handleExport = async () => {
    // === TRIAL EXPORT GATING ===
    if (isOnTrial || hasTrialExpired) {
      if (hasTrialExpired) {
        setTrialGateType('expired');
        setTrialGateOpen(true);
        return;
      }
      if (trialExportsRemaining <= 0) {
        setTrialGateType('exhausted');
        setTrialGateOpen(true);
        return;
      }
    }

    setIsExporting(true);

    try {
      let idsToExport: string[];

      if (selectedIds.length > 0) {
        idsToExport = selectedIds;
      } else {
        // Fetch ALL property IDs using cursor pagination (faster for large lists)
        setExportProgress("Fetching all property IDs...");
        const allIds: string[] = [];
        const BATCH = 1000;
        let lastId: string | null = null;
        let hasMore = true;

        while (hasMore) {
          let query = supabase
            .from("list_properties")
            .select("id, property_id")
            .eq("list_id", listId!)
            .order("id", { ascending: true })
            .limit(BATCH);

          if (lastId) {
            query = query.gt("id", lastId);
          }

          const { data: batch, error } = await query;

          if (error) throw new Error(`Failed to fetch property IDs: ${error.message}`);
          if (!batch || batch.length === 0) {
            hasMore = false;
            break;
          }

          allIds.push(...batch.map((r) => r.property_id).filter(Boolean));
          lastId = batch[batch.length - 1].id;
          setExportProgress(`Fetched ${allIds.length.toLocaleString()} property IDs...`);
          hasMore = batch.length === BATCH;
        }

        idsToExport = allIds;
      }

      if (idsToExport.length === 0) {
        toast({
          title: "Nothing to export",
          description: "No properties to export",
          variant: "destructive",
        });
        setIsExporting(false);
        setExportProgress(null);
        return;
      }

      const propertyCount = idsToExport.length;

      // === TRIAL: check count against remaining trial exports ===
      if (isOnTrial && propertyCount > trialExportsRemaining) {
        toast({
          variant: "destructive",
          title: "Too many properties",
          description: `You have ${trialExportsRemaining} trial exports remaining. Select fewer properties or upgrade.`,
          duration: 6000,
        });
        setIsExporting(false);
        setExportProgress(null);
        return;
      }

      // Check quota — if over limit, show partial export option instead of blocking
      const remaining = getRemainingCount('exports');
      const used = usage?.exports_count ?? 0;
      const max = plan?.max_monthly_exports ?? 0;

      // For unlimited plans (remaining === null), skip check
      if (!isOnTrial && remaining !== null && propertyCount > remaining) {
        // Store IDs for partial export
        pendingExportIdsRef.current = idsToExport;
        setExportContextData({
          requestedCount: propertyCount,
          remainingCount: remaining,
          usedCount: used,
          maxCount: max,
          onPartialExport: handlePartialExport,
        });
        setShowUpgradePrompt(true);
        setIsExporting(false);
        setExportProgress(null);
        return;
      }

      // Quota OK — proceed with full export
      await executeExport(idsToExport, propertyCount);
    } catch (error: unknown) {
      const t = getExportErrorToast(error);
      toast({ title: t.title, description: t.description, variant: t.variant });
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleRemoveSelected = async () => {
    if (!listId || selectedIds.length === 0) return;

    try {
      await removeFromListMutation.mutateAsync({
        listId,
        propertyIds: selectedIds,
      });

      toast({
        title: "Removed",
        description: `Removed ${selectedIds.length} properties from list`,
      });

      setSelectedIds([]);
      setSelectMode("page");
      setShowRemoveDialog(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Failed to remove",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  if (!listId) {
    navigate("/lists");
    return null;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/lists")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{currentList?.name || "List"}</h1>
              <p className="text-muted-foreground">
                {totalCount.toLocaleString()} properties
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
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
              {selectedIds.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.length.toLocaleString()} properties selected
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowRemoveDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove ({selectedIds.length.toLocaleString()})
                  </Button>
                </>
              )}
              <Button
                onClick={handleExport}
                disabled={isExporting || properties.length === 0 || isOverExportLimit}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {isExporting && exportProgress
                  ? exportProgress
                  : selectedIds.length > 0
                  ? `Export (${selectedIds.length.toLocaleString()})`
                  : `Export All (${totalCount.toLocaleString()})`}
              </Button>
            </div>
          </div>
        </div>

        {/* Property Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : properties.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No properties in this list yet</p>
            <Button className="mt-4" onClick={() => navigate("/properties")}>
              Add Properties from Search
            </Button>
          </Card>
        ) : (
          <>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left w-10">
                        <div className="flex items-center" ref={dropdownRef}>
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleToggleSelectAll}
                          />
                          <button
                            onClick={() => {
                              setDropdownOpen(!dropdownOpen);
                              setShowCustomInput(false);
                            }}
                            className="ml-0.5 p-0.5 rounded hover:bg-muted transition-colors relative"
                            aria-label="Selection options"
                          >
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>

                          {/* Dropdown menu */}
                          {dropdownOpen && (
                            <div className="absolute top-full mt-1 left-3 bg-popover border border-border rounded-md shadow-md py-1 min-w-[200px] z-50">
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors font-normal"
                                onClick={handleSelectVisible}
                              >
                                Select Visible
                                <span className="text-muted-foreground ml-1">({properties.length})</span>
                              </button>

                              {!showCustomInput ? (
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors font-normal"
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
                      </th>
                      <th className="p-3 text-left">Address</th>
                      <th className="p-3 text-left">City</th>
                      <th className="p-3 text-left">State</th>
                      <th className="p-3 text-left">ZIP</th>
                      <th className="p-3 text-center">Score</th>
                      <th className="p-3 text-center">Violations</th>
                      <th className="p-3 text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((property) => (
                      <tr
                        key={property.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => handleToggleSelect(property.id)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(property.id)}
                            onCheckedChange={() => handleToggleSelect(property.id)}
                          />
                        </td>
                        <td className="p-3 font-medium">{property.address}</td>
                        <td className="p-3">{property.city}</td>
                        <td className="p-3">{property.state}</td>
                        <td className="p-3">{property.zip}</td>
                        <td className="p-3 text-center">
                          {property.snap_score !== null ? (
                            <Badge
                              variant={
                                property.snap_score >= 70
                                  ? "default"
                                  : property.snap_score >= 40
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {property.snap_score}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline">
                            {property.open_violations || 0} / {property.total_violations || 0}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {property.enforcement_type === "water_shutoff" ? (
                            <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                              💧 Water
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Code</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Remove Confirmation */}
        <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Properties</AlertDialogTitle>
              <AlertDialogDescription>
                Remove {selectedIds.length} properties from this list? The properties
                will not be deleted, only removed from this list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveSelected}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Trial Export Gate */}
        <TrialExportGate
          open={trialGateOpen}
          onOpenChange={setTrialGateOpen}
          type={trialGateType}
          trialTier={trialTier}
          trialEndsAt={trialEndsAt}
        />

        {/* Upgrade Prompt with partial export support */}
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

export default ListDetail;
