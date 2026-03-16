import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { LeadsMap } from "@/components/leads/LeadsMap";
import { FilterBar } from "@/components/leads/FilterBar";
import { BulkActionBar, type SelectMode } from "@/components/leads/BulkActionBar";
import { PropertyDetailPanel } from "@/components/leads/PropertyDetailPanel";
import { MobilePropertyDetailSheet } from "@/components/leads/MobilePropertyDetailSheet";
import { MobileFilterSheet } from "@/components/leads/MobileFilterSheet";
import { VirtualizedMobilePropertyList } from "@/components/leads/VirtualizedMobilePropertyList";
import { AddToListDialog } from "@/components/leads/AddToListDialog";
import { AddAllToListDialog } from "@/components/leads/AddAllToListDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PersonalStatsBar } from "@/components/leads/PersonalStatsBar";
import { UpgradePrompt, type ExportContext } from "@/components/subscription/UpgradePrompt";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";
import { exportFilteredCsv } from "@/services/export";
import { useProperties } from "@/hooks/useProperties";
import type { LeadFilters } from "@/schemas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { Input } from "@/components/ui/input";
import { ExportQuotaDisplay } from "@/components/leads/ExportQuotaDisplay";
import { WaterShutoffUpgradeBanner } from "@/components/leads/WaterShutoffUpgradeBanner";
import { SelectionActionBar } from "@/components/leads/SelectionActionBar";
import { AppLayout } from "@/components/layout/AppLayout";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useTrialExportNotifications } from "@/hooks/useTrialExportNotifications";
import { TrialExportGate } from "@/components/trial/TrialExportGate";
import { TrialPaywall } from "@/components/trial/TrialPaywall";
import { useSavedProperties } from "@/hooks/useSavedProperties";

const PAGE_SIZE = 50;

function Leads() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { showOnboarding, setShowOnboarding, markOnboardingComplete } = useOnboarding();
  const { plan, usage, refetch: refetchSubscription, getRemainingCount, hasActiveSubscription } = useSubscription();
  useSubscriptionGate({ showToast: false }); // Still needed for subscription context
  const {
    isOnTrial,
    hasTrialExpired,
    canExport: trialCanExport,
    trialExportsUsed,
    trialExportsRemaining,
    trialExportsLimit,
    trialTier,
    trialEndsAt,
    subscriptionStatus,
    incrementTrialExports,
    refetch: refetchTrial,
  } = useTrialStatus();
  const { showExportNotification } = useTrialExportNotifications();
  const { savedSet, toggleSaved, isSaved } = useSavedProperties();

  // Refs for scrolling list containers to top on page change
  const desktopListRef = useRef<HTMLDivElement>(null);
  const mobileListRef = useRef<HTMLDivElement>(null);

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
  const [openViolationsOnly, setOpenViolationsOnly] = useState(false); // Show all violations by default
  const [multipleViolationsOnly, setMultipleViolationsOnly] = useState(false);
  const [repeatOffenderOnly, setRepeatOffenderOnly] = useState(false);

  // SnapScore range filter state (Enterprise only)
  const [snapScoreRange, setSnapScoreRange] = useState<[number, number]>([0, 100]);

  // Sort state - default to recently updated for freshest data
  const [sortBy, setSortBy] = useState<SortOption>("recently_updated");

  // Mobile view state
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  // Upgrade prompt state for export limits only
  const [upgradePromptType, setUpgradePromptType] = useState<"exports" | null>(null);

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
  const [selectMode, setSelectMode] = useState<SelectMode>("page");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddToListDialog, setShowAddToListDialog] = useState(false);


  const [showAddAllToListDialog, setShowAddAllToListDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeLimitType, setUpgradeLimitType] = useState<"exports">("exports");
  const [exportContextData, setExportContextData] = useState<ExportContext | undefined>(undefined);
  const [trialGateOpen, setTrialGateOpen] = useState(false);
  const [trialGateType, setTrialGateType] = useState<"exhausted" | "expired">("exhausted");

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
    // Count SnapScore if not default range
    if (snapScoreRange[0] !== 0 || snapScoreRange[1] !== 100) count++;
    return count;
  }, [
    lastSeenDays,
    selectedCity,
    selectedState,
    selectedSignal,
    openViolationsOnly,
    multipleViolationsOnly,
    repeatOffenderOnly,
    snapScoreRange,
  ]);

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

    // SnapScore range filter (only if not default)
    if (snapScoreRange[0] !== 0 || snapScoreRange[1] !== 100) {
      f.snapScoreRange = snapScoreRange;
    }

    // Sorting - always include
    f.sortBy = sortBy;

    console.log("[Leads] Active filters:", JSON.stringify(f));
    return f;
  }, [
    searchQuery,
    selectedCity,
    selectedState,
    lastSeenDays,
    selectedSignal,
    openViolationsOnly,
    multipleViolationsOnly,
    repeatOffenderOnly,
    snapScoreRange,
    sortBy,
  ]);

  // Use paginated properties hook for the list
  const { data, isLoading, error, refetch } = useProperties(page, PAGE_SIZE, filters);

  // Auto-select property from URL param (e.g. from digest email)
  useEffect(() => {
    const propertyIdParam = searchParams.get("propertyId");
    if (!propertyIdParam) return;
    if (isLoading) return;

    setSelectedPropertyId(propertyIdParam);

    const newParams = new URLSearchParams(searchParams);
    newParams.delete("propertyId");
    setSearchParams(newParams, { replace: true });
  }, [searchParams, isLoading, setSearchParams]);

  // Map now uses viewport-based loading - no pre-fetching needed

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

  const properties = data?.data ?? [];
  const totalCount = data?.total ?? 0;

  // Scroll to top when page changes and new data arrives
  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current !== page) {
      prevPageRef.current = page;
      // Wait for new data to render, then scroll
      requestAnimationFrame(() => {
        // Scroll internal overflow containers (desktop virtualized list)
        const scrollContainer =
          desktopListRef.current?.querySelector("[class*='overflow-y']") ??
          mobileListRef.current?.querySelector("[class*='overflow-y']");
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
        }
        // Scroll the window itself (mobile views)
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }, [page, data]);
  const dataTier = data?.dataTier ?? null;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setLastSeenDays(null);
    setSelectedCity(null);
    setSelectedState(null);
    setSelectedSignal(null);
    setOpenViolationsOnly(false); // Show all violations by default
    setMultipleViolationsOnly(false);
    setRepeatOffenderOnly(false);
    setSnapScoreRange([0, 100]);
    setPage(1);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    // If user manually toggles individual items, switch to page mode
    setSelectMode("page");
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === properties.length ? [] : properties.map((p) => p.id)));
    setSelectMode("page");
  };

  // Three-mode selection handlers
  const handleSelectVisible = useCallback(() => {
    setSelectedIds(properties.map((p) => p.id));
    setSelectMode("page");
  }, [properties]);

  const handleSelectCustomAmount = useCallback(async (amount: number) => {
    setSelectMode("custom");
    // Fetch first N property IDs from the filtered result set
    // Use the same RPC with a large page size to get IDs
    try {
      const filtersObj = filters as LeadFilters;
      const rpcName = filtersObj.violationType ? "fn_properties_by_category" : "fn_properties_paged";
      const params = filtersObj.violationType
        ? {
            p_category: filtersObj.violationType,
            p_state: filtersObj.state || null,
            p_city: filtersObj.cities?.length === 1 ? filtersObj.cities[0] : null,
            p_search: filtersObj.search || null,
            p_snap_min: filtersObj.snapScoreRange?.[0] ?? null,
            p_snap_max: filtersObj.snapScoreRange?.[1] ?? null,
            p_last_seen_days: filtersObj.lastSeenDays ?? null,
            p_page: 1,
            p_page_size: amount,
            p_sort_by: filtersObj.sortBy || "recently_updated",
            p_open_violations_only: filtersObj.openViolationsOnly ?? false,
            p_multiple_violations_only: filtersObj.multipleViolationsOnly ?? false,
            p_repeat_offender_only: filtersObj.repeatOffenderOnly ?? false,
          }
        : {
            p_page: 1,
            p_page_size: amount,
            p_state: filtersObj.state || null,
            p_city: filtersObj.cities?.length === 1 ? filtersObj.cities[0] : null,
            p_search: filtersObj.search || null,
            p_snap_min: filtersObj.snapScoreRange?.[0] ?? null,
            p_snap_max: filtersObj.snapScoreRange?.[1] ?? null,
            p_last_seen_days: filtersObj.lastSeenDays ?? null,
            p_sort_by: filtersObj.sortBy || "recently_updated",
            p_open_violations_only: filtersObj.openViolationsOnly ?? false,
            p_multiple_violations_only: filtersObj.multipleViolationsOnly ?? false,
            p_repeat_offender_only: filtersObj.repeatOffenderOnly ?? false,
          };

      const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, params);
      if (rpcError) throw rpcError;

      const result = rpcData as { items: { id: string }[]; total: number };
      const ids = (result.items ?? []).map((item) => item.id);
      setSelectedIds(ids);
      toast({
        title: "Selection Updated",
        description: `Selected ${ids.length.toLocaleString()} properties`,
      });
    } catch (err: any) {
      console.error("[Leads] Custom amount selection error:", err);
      toast({
        title: "Selection Failed",
        description: "Could not fetch property IDs. Please try again.",
        variant: "destructive",
      });
      setSelectMode("page");
    }
  }, [filters, toast]);

  const handleSelectMax = useCallback(async (amount: number) => {
    setSelectMode("all");
    // Fetch property IDs up to the specified max amount
    try {
      const filtersObj = filters as LeadFilters;
      const fetchAmount = Math.min(amount, totalCount, 25000); // Cap at 25k
      const rpcName = filtersObj.violationType ? "fn_properties_by_category" : "fn_properties_paged";
      const params = filtersObj.violationType
        ? {
            p_category: filtersObj.violationType,
            p_state: filtersObj.state || null,
            p_city: filtersObj.cities?.length === 1 ? filtersObj.cities[0] : null,
            p_search: filtersObj.search || null,
            p_snap_min: filtersObj.snapScoreRange?.[0] ?? null,
            p_snap_max: filtersObj.snapScoreRange?.[1] ?? null,
            p_last_seen_days: filtersObj.lastSeenDays ?? null,
            p_page: 1,
            p_page_size: fetchAmount,
            p_sort_by: filtersObj.sortBy || "recently_updated",
            p_open_violations_only: filtersObj.openViolationsOnly ?? false,
            p_multiple_violations_only: filtersObj.multipleViolationsOnly ?? false,
            p_repeat_offender_only: filtersObj.repeatOffenderOnly ?? false,
          }
        : {
            p_page: 1,
            p_page_size: fetchAmount,
            p_state: filtersObj.state || null,
            p_city: filtersObj.cities?.length === 1 ? filtersObj.cities[0] : null,
            p_search: filtersObj.search || null,
            p_snap_min: filtersObj.snapScoreRange?.[0] ?? null,
            p_snap_max: filtersObj.snapScoreRange?.[1] ?? null,
            p_last_seen_days: filtersObj.lastSeenDays ?? null,
            p_sort_by: filtersObj.sortBy || "recently_updated",
            p_open_violations_only: filtersObj.openViolationsOnly ?? false,
            p_multiple_violations_only: filtersObj.multipleViolationsOnly ?? false,
            p_repeat_offender_only: filtersObj.repeatOffenderOnly ?? false,
          };

      const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, params);
      if (rpcError) throw rpcError;

      const result = rpcData as { items: { id: string }[]; total: number };
      const ids = (result.items ?? []).map((item) => item.id);
      setSelectedIds(ids);
      toast({
        title: "Selection Updated",
        description: `Selected ${ids.length.toLocaleString()} properties (max exportable)`,
      });
    } catch (err: any) {
      console.error("[Leads] Select max error:", err);
      toast({
        title: "Selection Failed",
        description: "Could not fetch property IDs. Please try again.",
        variant: "destructive",
      });
      setSelectMode("page");
    }
  }, [filters, totalCount, toast]);

  // Handle page change — don't clear selection for 'all' or 'custom' modes
  const handlePageChange = (newPage: number) => {
    if (selectedIds.length > 0 && selectMode === "page") {
      setPendingPage(newPage);
    } else {
      setPage(newPage);
    }
  };

  const confirmPageChange = () => {
    if (pendingPage !== null) {
      setSelectedIds([]);
      setSelectMode("page");
      setPage(pendingPage);
      setPendingPage(null);
    }
  };

  const cancelPageChange = () => {
    setPendingPage(null);
  };

  // Export remaining count for limit enforcement
  const exportRemaining = getRemainingCount("exports");

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

    // === TRIAL EXPORT GATING ===
    if (isOnTrial || hasTrialExpired) {
      // Trial expired
      if (hasTrialExpired) {
        setTrialGateType("expired");
        setTrialGateOpen(true);
        return;
      }

      // Trial exports exhausted
      if (trialExportsRemaining <= 0) {
        setTrialGateType("exhausted");
        setTrialGateOpen(true);
        return;
      }

      // Would exceed remaining trial exports
      if (propertyCount > trialExportsRemaining) {
        toast({
          variant: "destructive",
          title: "Too many properties selected",
          description: `You have ${trialExportsRemaining} trial exports remaining. Select fewer properties or upgrade for more.`,
          duration: 6000,
        });
        return;
      }

      // Trial export allowed — proceed
      setIsExporting(true);
      try {
        toast({
          title: "Export Started",
          description: `Exporting ${propertyCount.toLocaleString()} properties to CSV.`,
          duration: 5000,
        });

        await exportFilteredCsv({
          propertyIds: selectedIds,
          expectedPropertyCount: propertyCount,
          stateFilter: selectedState || undefined,
          cityFilter: selectedCity || undefined,
          filters: filters as Record<string, unknown>,
        });

        // Server-side trial export tracking is now handled by the export-csv edge function.
        // Small delay then refresh local trial status to reflect updated count from DB.
        await new Promise((resolve) => setTimeout(resolve, 800));
        await refetchTrial();

        const newRemaining = Math.max(0, trialExportsRemaining - propertyCount);
        toast({
          title: "Export Complete",
          description: `Exported ${propertyCount.toLocaleString()} properties — ${newRemaining} trial exports remaining`,
        });

        setSelectedIds([]);
      } catch (error: any) {
        console.error("[Leads] Trial export error:", error);
        if (error.message === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
          setTrialGateType("exhausted");
          setTrialGateOpen(true);
        } else if (error.message === "TRIAL_EXPIRED") {
          setTrialGateType("expired");
          setTrialGateOpen(true);
        } else {
          toast({
            title: "Export Failed",
            description: error.message || "Failed to export properties",
            variant: "destructive",
          });
        }
        await refetchTrial();
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // === PAID SUBSCRIPTION EXPORT FLOW ===
    const remaining = getRemainingCount("exports");
    const used = usage?.exports_count ?? 0;
    const max = plan?.max_monthly_exports ?? 0;

    // For unlimited plans (remaining === null), skip the client-side check
    if (remaining !== null && propertyCount > remaining) {
      // Show partial export option instead of just blocking
      setUpgradeLimitType("exports");
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
            await new Promise((resolve) => setTimeout(resolve, 500));
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
      const estimatedTime =
        estimatedSeconds > 60
          ? `~${Math.ceil(estimatedSeconds / 60)} minute${Math.ceil(estimatedSeconds / 60) > 1 ? "s" : ""}`
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

      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Exported ${selectedIds.length.toLocaleString()} properties`,
      });

      setSelectedIds([]);
    } catch (error: any) {
      console.error("[Leads] Export error:", error);

      if (error.message === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
        setTrialGateType("exhausted");
        setTrialGateOpen(true);
        return;
      }
      if (error.message === "TRIAL_EXPIRED") {
        setTrialGateType("expired");
        setTrialGateOpen(true);
        return;
      }
      if (error.message === "EXPORT_LIMIT_EXCEEDED") {
        // Server rejected — build context for partial export
        setUpgradeLimitType("exports");
        const serverRemaining = getRemainingCount("exports") ?? 0;
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
                stateFilter: selectedState || undefined,
                cityFilter: selectedCity || undefined,
                filters: filters as Record<string, unknown>,
              });
              await new Promise((resolve) => setTimeout(resolve, 500));
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
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties]);
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
    violationsData.forEach((v) => {
      const existing = violationsByPropertyId.get(v.property_id) || [];
      existing.push(v);
      violationsByPropertyId.set(v.property_id, existing);
    });

    let result = properties.map((p) => ({
      ...p,
      violations: violationsByPropertyId.get(p.id) || [],
    }));

    return result;
  }, [properties, violationsData]);

  // Keep performance optimization with useMemo
  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return mappedProperties.find((p) => p.id === selectedPropertyId) ?? null;
  }, [mappedProperties, selectedPropertyId]);

  // Determine if user should be gated (expired trial or cancelled subscription, no active paid plan)
  const isCancelled = subscriptionStatus === "cancelled" || subscriptionStatus === "expired";
  const isFullyGated = (hasTrialExpired || isCancelled) && !hasActiveSubscription;

  return (
    <AppLayout>
      <div className="relative flex flex-col h-[calc(100vh-3.5rem)]">
        {isFullyGated && <TrialPaywall trialEndsAt={trialEndsAt} />}
        <OnboardingFlow open={showOnboarding} onOpenChange={setShowOnboarding} onComplete={markOnboardingComplete} />

        {/* Water shutoff upgrade banner for Starter users */}
        <WaterShutoffUpgradeBanner dataTier={dataTier} />

        <UpgradePrompt
          open={showUpgradePrompt}
          onOpenChange={setShowUpgradePrompt}
          limitType={upgradeLimitType}
          currentPlan={plan?.name}
          exportContext={exportContextData}
        />

        {/* DESKTOP: Ultra-compact single-row filter bar */}
        <div className="hidden md:flex items-center gap-4 px-4 py-2 border-b bg-background flex-wrap">
          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 h-7 text-xs"
            />
          </div>

          {/* State/City */}
          <EnforcementAreaFilter
            selectedCity={selectedCity}
            selectedState={selectedState}
            onCityChange={(c) => {
              setSelectedCity(c);
              setPage(1);
            }}
            onStateChange={(s) => {
              setSelectedState(s);
              setPage(1);
            }}
          />

          {/* Time */}
          <TimeFilter
            lastSeenDays={lastSeenDays}
            onLastSeenChange={(v) => {
              setLastSeenDays(v);
              setPage(1);
            }}
          />

          {/* Issue Type */}
          <EnforcementSignalsFilter
            selectedSignal={selectedSignal}
            onSignalChange={(v) => {
              setSelectedSignal(v);
              setPage(1);
              if (v) setSearchInput("");
            }}
            selectedState={selectedState}
            selectedCity={selectedCity}
          />

          {/* Pressure Level */}
          <PressureLevelFilter
            openViolationsOnly={openViolationsOnly}
            onOpenViolationsChange={(v) => {
              setOpenViolationsOnly(v);
              setPage(1);
            }}
            multipleViolationsOnly={multipleViolationsOnly}
            onMultipleViolationsChange={(v) => {
              setMultipleViolationsOnly(v);
              setPage(1);
            }}
            repeatOffenderOnly={repeatOffenderOnly}
            onRepeatOffenderChange={(v) => {
              setRepeatOffenderOnly(v);
              setPage(1);
            }}
          />

          {/* Spacer + Actions */}
          <div className="flex-1" />
          <PersonalStatsBar />
          <FreshnessIndicator />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={!activeFilterCount}
            className="h-7 px-2 text-xs gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </Button>
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
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <MobileFilterSheet
              selectedCity={selectedCity}
              selectedState={selectedState}
              onCityChange={(c) => {
                setSelectedCity(c);
                setPage(1);
              }}
              onStateChange={(s) => {
                setSelectedState(s);
                setPage(1);
              }}
              lastSeenDays={lastSeenDays}
              onLastSeenChange={(v) => {
                setLastSeenDays(v);
                setPage(1);
              }}
              selectedSignal={selectedSignal}
              onSignalChange={(v) => {
                setSelectedSignal(v);
                setPage(1);
                if (v) setSearchInput("");
              }}
              openViolationsOnly={openViolationsOnly}
              onOpenViolationsChange={(v) => {
                setOpenViolationsOnly(v);
                setPage(1);
              }}
              multipleViolationsOnly={multipleViolationsOnly}
              onMultipleViolationsChange={(v) => {
                setMultipleViolationsOnly(v);
                setPage(1);
              }}
              repeatOffenderOnly={repeatOffenderOnly}
              onRepeatOffenderChange={(v) => {
                setRepeatOffenderOnly(v);
                setPage(1);
              }}
              onClearFilters={handleClearFilters}
              activeFilterCount={activeFilterCount}
              propertyCount={totalCount}
              onAddAllToList={() => setShowAddAllToListDialog(true)}
              sortBy={sortBy}
              onSortChange={(v) => {
                setSortBy(v);
                setPage(1);
              }}
            />
          </div>

          {/* Stats + View Toggle */}
          <div className="flex flex-col gap-1.5 px-3 pb-2">
            <div className="flex items-center justify-between">
              <PersonalStatsBar />
            </div>
            <div className="flex items-center justify-between">
              <FreshnessIndicator />
              <div className="inline-flex rounded-lg border bg-muted p-1">
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mobileView === "list"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMobileView("list")}
                >
                  <List className="h-4 w-4" />
                  List
                </button>
                <button
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    mobileView === "map"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMobileView("map")}
                >
                  <MapIcon className="h-4 w-4" />
                  Map
                </button>
              </div>
            </div>
          </div>

          {/* Filter Results Count - Mobile */}
          {(activeFilterCount > 0 || searchQuery?.trim()) && (
            <div className="px-3 py-2 text-sm text-muted-foreground border-b bg-muted/30">
              <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> properties match your
              filters
            </div>
          )}

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
              filters={filters as LeadFilters}
              onPropertyClick={(id) => {
                setSelectedPropertyId(id);
              }}
              selectedPropertyId={selectedPropertyId || undefined}
            />
          </div>

          {/* Property List - Right Side */}
          <div className="w-[40%] flex flex-col relative">
            {/* Filter Results Count - Desktop */}
            {(activeFilterCount > 0 || searchQuery?.trim()) && (
              <div className="px-3 py-2 text-sm text-muted-foreground border-b bg-muted/30">
                <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> properties match your
                filters
              </div>
            )}

            {/* Compact Header - single row */}
            {properties.length > 0 && (
              <div className="px-3 py-1.5 border-b bg-background flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selectedIds.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {selectedIds.length.toLocaleString()} properties selected
                    </span>
                  )}
                  <SortByDropdown
                    value={sortBy}
                    onChange={(v) => {
                      setSortBy(v);
                      setPage(1);
                    }}
                  />
                </div>
                <Button
                  onClick={handleExportCSV}
                  disabled={selectedIds.length === 0 || isFullyGated || (hasTrialExpired && !trialCanExport)}
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 text-xs ${isFullyGated || hasTrialExpired ? "opacity-50" : ""}`}
                  title={
                    isFullyGated
                      ? "Subscribe to unlock exports"
                      : hasTrialExpired
                        ? "Trial expired — upgrade to export"
                        : undefined
                  }
                  data-blur-gated={isFullyGated ? "export" : undefined}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export
                </Button>
              </div>
            )}

            <div ref={desktopListRef} className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading properties...</div>
              ) : properties.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No properties found</div>
              ) : (
                <VirtualizedPropertyList
                  properties={mappedProperties}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onPropertyClick={(id) => {
                    setSelectedPropertyId(id);
                  }}
                  savedSet={savedSet}
                  onToggleSaved={toggleSaved}
                />
              )}
            </div>

            {/* Compact Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 px-2 py-1 border-t bg-background text-xs">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="h-6 px-2 text-xs"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-muted-foreground">
                  {page}/{totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="h-6 px-2 text-xs"
                >
                  <ChevronRight className="h-3 w-3" />
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
              onSelectVisible={handleSelectVisible}
              onSelectCustomAmount={handleSelectCustomAmount}
              onSelectMax={handleSelectMax}
              totalFilteredCount={totalCount}
              showSelectMax={true}
              exportRemaining={exportRemaining}
            />
          </div>
        </div>

        {/* MOBILE: Stacked layout */}
        <div className="md:hidden flex-1 flex flex-col overflow-hidden">
          {mobileView === "map" ? (
            /* Map View - Full height */
            <div className="flex-1 relative">
              <LeadsMap
                filters={filters as LeadFilters}
                onPropertyClick={(id) => {
                  setSelectedPropertyId(id);
                }}
                selectedPropertyId={selectedPropertyId || undefined}
              />
            </div>
          ) : (
            /* List View */
            <div ref={mobileListRef} className="flex-1 flex flex-col min-h-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading properties...</div>
              ) : properties.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No properties found</div>
              ) : (
                <div
                  className="flex-1 flex flex-col overflow-hidden"
                  style={{ paddingBottom: 0 }}
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
                          ? `${selectedIds.length.toLocaleString()} properties selected`
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
                            Export ({selectedIds.length.toLocaleString()})
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedIds([]); setSelectMode("page"); }}
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
                    savedSet={savedSet}
                    onToggleSaved={toggleSaved}
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
        {selectedProperty && !isMobile && (
          <PropertyDetailPanel
            property={selectedProperty}
            open={true}
            onOpenChange={(open) => !open && setSelectedPropertyId(null)}
          />
        )}

        {selectedProperty && isMobile && (
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
            // Show warning if filters active that won't be applied to "Add All"
            hasAdditionalFilters: !!(
              lastSeenDays ||
              selectedSignal ||
              openViolationsOnly ||
              multipleViolationsOnly ||
              repeatOffenderOnly ||
              searchQuery
            ),
          }}
          onSuccess={() => {
            toast({
              title: "List Updated",
              description: "Properties have been added to your list",
            });
          }}
        />

        {/* Trial Export Gate (exhausted/expired) */}
        <TrialExportGate
          open={trialGateOpen}
          onOpenChange={setTrialGateOpen}
          type={trialGateType}
          trialTier={trialTier}
          trialEndsAt={trialEndsAt}
        />

        {/* Upgrade Prompt for Export Limits */}
        <UpgradePrompt
          open={!!upgradePromptType}
          onOpenChange={(open) => !open && setUpgradePromptType(null)}
          limitType={upgradePromptType || "exports"}
        />

        {/* Floating Selection Action Bar - shows on mobile and when items selected */}
        {isMobile && (
          <SelectionActionBar
            selectedCount={selectedIds.length}
            onExportCSV={handleExportCSV}
            onAddToList={() => setShowAddToListDialog(true)}
            onClearSelection={() => { setSelectedIds([]); setSelectMode("page"); }}
            isExporting={isExporting}
            visibleCount={properties.length}
            allVisibleSelected={selectedIds.length === properties.length && properties.length > 0}
            onToggleSelectAll={handleToggleSelectAll}
            onSelectVisible={handleSelectVisible}
            onSelectCustomAmount={handleSelectCustomAmount}
            onSelectMax={handleSelectMax}
            totalFilteredCount={totalCount}
            showSelectMax={true}
            exportRemaining={exportRemaining}
          />
        )}

        {/* Page Change Warning Dialog */}
        <AlertDialog open={pendingPage !== null} onOpenChange={(open) => !open && cancelPageChange()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear selection?</AlertDialogTitle>
              <AlertDialogDescription>
                You have {selectedIds.length} properties selected. Changing pages will clear your selection. Would you
                like to export first or continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelPageChange}>Cancel</AlertDialogCancel>
              <Button
                variant="outline"
                onClick={() => {
                  handleExportCSV();
                  cancelPageChange();
                }}
              >
                Export First
              </Button>
              <AlertDialogAction onClick={confirmPageChange}>Continue & Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

export default Leads;
