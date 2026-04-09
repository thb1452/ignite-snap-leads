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
import { ChevronLeft, ChevronRight, Search, X, Map as MapIcon, List, Download, Loader2, Lock, SlidersHorizontal } from "lucide-react";
import { VirtualizedPropertyList } from "@/components/leads/VirtualizedPropertyList";
import { AiSearchBar } from "@/components/leads/AiSearchBar";
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
import { exportFilteredCsv, getExportErrorToast, EXPORT_LIMIT_EXCEEDED } from "@/services/export";
import { useProperties } from "@/hooks/useProperties";
import type { LeadFilters } from "@/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";

/** Smaller RPC pages avoid huge JSON payloads and timeouts when selecting thousands of leads. */
const LEAD_SELECTION_PAGE_SIZE = 500;

async function fetchFilteredPropertyIdsForSelection(filtersObj: LeadFilters, maxIds: number): Promise<string[]> {
  const ids: string[] = [];
  const rpcName = filtersObj.violationType ? "fn_properties_by_category" : "fn_properties_paged";
  let page = 1;

  const categoryBase = {
    p_category: filtersObj.violationType as string,
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

  const pagedBase = {
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

  while (ids.length < maxIds) {
    const pageSize = Math.min(LEAD_SELECTION_PAGE_SIZE, maxIds - ids.length);
    const params = filtersObj.violationType
      ? { ...categoryBase, p_page: page, p_page_size: pageSize }
      : { ...pagedBase, p_page: page, p_page_size: pageSize };

    const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, params);
    if (rpcError) throw rpcError;

    const result = rpcData as { items: { id: string }[]; total: number };
    const batch = (result.items ?? []).map((item) => item.id);
    if (batch.length === 0) break;
    ids.push(...batch);
    if (batch.length < pageSize) break;
    page += 1;
  }

  return ids;
}
import { useAuth } from "@/hooks/use-auth";
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
import { buildFiltersFromState, countActiveFilters, logFilters } from "@/utils/filterUtils";
import { useUnlockedProperties } from "@/hooks/useUnlockedProperties";
import { useViewLimit } from "@/hooks/useViewLimit";
import { useFreeUnlocks } from "@/hooks/useFreeUnlocks";
import { useCreditBalance } from "@/hooks/useCredits";
import { UnlockModal } from "@/components/leads/UnlockModal";
import { ViewLimitModal } from "@/components/leads/ViewLimitModal";
import { BulkUnlockBar } from "@/components/leads/BulkUnlockBar";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import {
  clearPendingStripeUnlockCheckout,
  getPendingStripeUnlockSessionId,
  getPendingStripeUnlock,
} from "@/utils/pendingStripeUnlock";
import { clearPendingStripeCheckout, getPendingStripeCheckout } from "@/utils/pendingStripeCheckout";

const PAGE_SIZE = 50;

function Leads() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
  const { freeUnlocksRemaining } = useFreeUnlocks();
  const { data: bulkCreditBalance = 0 } = useCreditBalance();
  const { viewCount, viewLimit, limitReached, recordView } = useViewLimit();
  const { isElitePlan, hasFeature } = useFeatureAccess();
  const canUsePressureLevelFilters = hasFeature('advanced_filters') || isElitePlan;
  const [unlockModalProperty, setUnlockModalProperty] = useState<any>(null);
  const [viewLimitModalOpen, setViewLimitModalOpen] = useState(false);
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




  // Sort state - default to highest snap score so best leads surface first
  const [sortBy, setSortBy] = useState<SortOption>("snap_score");

  // Mobile view state
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [desktopView, setDesktopView] = useState<"map" | "list">("map");
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("snap-filters-expanded") !== "false"; } catch { return true; }
  });

  const toggleFilters = useCallback(() => {
    setFiltersExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem("snap-filters-expanded", String(next)); } catch {}
      return next;
    });
  }, []);

  // Upgrade prompt state for export limits only
  const [upgradePromptType, setUpgradePromptType] = useState<"exports" | null>(null);

  // Demo credits hook
  const { isDemoMode, isAdmin } = useDemoCredits();

  // Debounce search input (300ms delay) and reset page when search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        setSearchQuery(searchInput);
        setPage(1); // Reset to first page when search changes
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);

  // Reset page when filters change (except sortBy)
  useEffect(() => {
    setPage(1);
    setSelectedIds([]); // Clear selection when filters change
    setSelectMode("page"); // Reset selection mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCity,
    selectedState,
    lastSeenDays,
    selectedSignal,
    openViolationsOnly,
    multipleViolationsOnly,
    repeatOffenderOnly,
    // Note: searchQuery and sortBy are handled separately
  ]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState<SelectMode>("page");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddToListDialog, setShowAddToListDialog] = useState(false);

  // When unlock confirmation finishes, we queue a toast to show only once the
  // property is actually available in the UI (loaded/selected).
  const [unlockToastPendingId, setUnlockToastPendingId] = useState<string | null>(null);


  const [showAddAllToListDialog, setShowAddAllToListDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeLimitType, setUpgradeLimitType] = useState<"exports">("exports");
  const [exportContextData, setExportContextData] = useState<ExportContext | undefined>(undefined);
  const [trialGateOpen, setTrialGateOpen] = useState(false);
  const [trialGateType, setTrialGateType] = useState<"exhausted" | "expired">("exhausted");

  // Build filters object for the hook using utility function
  const filters = useMemo(() => {
    const builtFilters = buildFiltersFromState({
      searchQuery,
      selectedCity,
      selectedState,
      lastSeenDays,
      selectedSignal,
      openViolationsOnly,
      multipleViolationsOnly,
      repeatOffenderOnly,
      sortBy,
    });
    
    logFilters("Leads", builtFilters);
    return builtFilters;
  }, [
    searchQuery,
    selectedCity,
    selectedState,
    lastSeenDays,
    selectedSignal,
    openViolationsOnly,
    multipleViolationsOnly,
    repeatOffenderOnly,
    sortBy,
  ]);

  // Count active filters using utility function (includes all filters)
  const activeFilterCount = useMemo(() => {
    return countActiveFilters(filters);
  }, [filters]);

  // Use paginated properties hook for the list
  const { data, isLoading, error, refetch } = useProperties(page, PAGE_SIZE, filters);

  // URL params: credits, Stripe checkout return (fulfill + invalidate), digest deep-link
  useEffect(() => {
    const propertyIdParam = searchParams.get("propertyId");
    const unlockedLegacy = searchParams.get("unlocked");
    const checkout = searchParams.get("checkout");
    const sessionIdParam = searchParams.get("session_id");
    const creditsAdded = searchParams.get("credits_added");
    const unlockCancelled = searchParams.get("unlock_cancelled");

    if (unlockCancelled) {
      clearPendingStripeUnlockCheckout();
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("unlock_cancelled");
      setSearchParams(newParams, { replace: true });
    }

    if (creditsAdded) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["credits", "balance"] }),
        queryClient.invalidateQueries({ queryKey: ["user", "credits"] }),
        queryClient.invalidateQueries({ queryKey: ["subscription"] }),
        queryClient.invalidateQueries({ queryKey: ["subscription-usage"] }),
        queryClient.invalidateQueries({ queryKey: ["free-unlocks"] }),
      ]);
      toast({
        title: "Payment received",
        description: `Finalizing your ${Number(creditsAdded).toLocaleString()} bulk credits now.`,
      });
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("credits_added");
      setSearchParams(newParams, { replace: true });
    }

    const targetUnlockPropertyId = propertyIdParam || unlockedLegacy;
    const queueUnlockToast = (propertyId: string) => setUnlockToastPendingId(propertyId);
    const markConfirmedLocal = (propertyId: string) => {
      if (!user?.id) return;
      queryClient.setQueryData(["confirmed-unlocked-local", user.id], (old: unknown) => {
        const next = old instanceof Set ? new Set(old) : new Set<string>();
        next.add(propertyId);
        return next;
      });
    };

    // Stripe return with only session_id (older / misconfigured success_url): fulfill via handle-unlock using session metadata.
    if (!checkout && sessionIdParam && !propertyIdParam && !unlockedLegacy && user?.id) {
      if (isLoading) return;

      let cancelled = false;
      const clearCheckoutParams = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("checkout");
        newParams.delete("session_id");
        newParams.delete("propertyId");
        newParams.delete("unlocked");
        setSearchParams(newParams, { replace: true });
      };

      (async () => {
        try {
          const { data: unlockData, error: unlockErr } = await supabase.functions.invoke<{
            success?: boolean;
            property_id?: string;
          }>("handle-unlock", {
            body: { stripe_session_id: sessionIdParam },
          });

          const unlockedPropertyId = unlockData?.property_id;

          if (!cancelled && !unlockErr && unlockData?.success && unlockedPropertyId) {
            clearPendingStripeUnlockCheckout();
            // Optimistic cache update so unlocked state shows instantly after navigation
            queryClient.setQueriesData(
              { queryKey: ["unlocked-properties", user.id] },
              (old: unknown) => {
                const next = old instanceof Set ? new Set(old) : new Set<string>();
                next.add(unlockedPropertyId);
                return next;
              }
            );
            queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
            setSelectedPropertyId(unlockedPropertyId);
            markConfirmedLocal(unlockedPropertyId);
            queueUnlockToast(unlockedPropertyId);
            clearCheckoutParams();
            return;
          }
        } catch (e) {
          console.error("[Leads] handle-unlock (session_id only):", e);
        }

        if (!cancelled) {
          toast({
            title: "Unlock pending",
            description:
              "Payment received. If this property stays locked, refresh in a moment or contact support.",
            variant: "destructive",
          });
          clearCheckoutParams();
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    // Paid single-unlock return: verify session server-side when possible, then confirm row in DB (webhook may lag).
    if (checkout === "success" && targetUnlockPropertyId && user?.id) {
      if (isLoading) return;

      let cancelled = false;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const markOptimistic = () => {
        queryClient.setQueryData(["optimistic-unlocked", user.id], (old: unknown) => {
          const next = old instanceof Set ? new Set(old) : new Set<string>();
          next.add(targetUnlockPropertyId);
          return next;
        });
      };
      const revertOptimistic = () => {
        queryClient.setQueryData(["optimistic-unlocked", user.id], (old: unknown) => {
          const next = old instanceof Set ? new Set(old) : new Set<string>();
          next.delete(targetUnlockPropertyId);
          return next;
        });
      };
      const clearCheckoutParams = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("checkout");
        newParams.delete("session_id");
        newParams.delete("propertyId");
        newParams.delete("unlocked");
        setSearchParams(newParams, { replace: true });
      };

      const confirmUnlockInDb = async (): Promise<boolean> => {
        const { data, error } = await supabase.rpc("fn_check_unlocked_batch", {
          p_user_id: user.id,
          p_property_ids: [targetUnlockPropertyId],
        });
        if (error) return false;
        return Array.isArray(data) && data.some((row: { property_id: string }) => row.property_id === targetUnlockPropertyId);
      };

      (async () => {
        setSelectedPropertyId(targetUnlockPropertyId);
        // Immediately show as unlocked after redirect; confirm in background.
        markOptimistic();

        const stripeSessionId =
          sessionIdParam || getPendingStripeUnlockSessionId(targetUnlockPropertyId);

        if (stripeSessionId) {
          try {
            const { data: unlockData, error: unlockErr } = await supabase.functions.invoke<{
              success?: boolean;
            }>("handle-unlock", {
              body: { stripe_session_id: stripeSessionId },
            });
            if (!cancelled && !unlockErr && unlockData?.success) {
              clearPendingStripeUnlockCheckout();
              markOptimistic();
              queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
              markConfirmedLocal(targetUnlockPropertyId);
              queueUnlockToast(targetUnlockPropertyId);
              clearCheckoutParams();
              return;
            }
          } catch (e) {
            console.error("[Leads] handle-unlock (stripe session):", e);
          }
        }

        for (let i = 0; i < 20 && !cancelled; i++) {
          if (await confirmUnlockInDb()) {
            clearPendingStripeUnlockCheckout();
            markOptimistic();
            queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
            markConfirmedLocal(targetUnlockPropertyId);
            queueUnlockToast(targetUnlockPropertyId);
            clearCheckoutParams();
            return;
          }
          await wait(1200);
        }

        if (!cancelled) {
          // If we couldn't confirm, revert the optimistic unlock to avoid a false-unlocked UI.
          revertOptimistic();
          toast({
            title: "Unlock pending",
            description: "Payment received. If this property stays locked, refresh in a moment or contact support.",
            variant: "destructive",
          });
          clearCheckoutParams();
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    // Legacy ?unlocked= only (older success_url): try handle-unlock using session id saved before Stripe redirect, else poll DB.
    if (unlockedLegacy && !sessionIdParam && !checkout) {
      if (isLoading || !user?.id) return;

      let cancelled = false;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

      (async () => {
        setSelectedPropertyId(unlockedLegacy);

        const storedSessionId = getPendingStripeUnlockSessionId(unlockedLegacy);

        if (storedSessionId) {
          try {
            const { data: unlockData, error: unlockErr } = await supabase.functions.invoke<{
              success?: boolean;
            }>("handle-unlock", {
              body: { stripe_session_id: storedSessionId },
            });
            if (!cancelled && !unlockErr && unlockData?.success) {
              clearPendingStripeUnlockCheckout();
              // Optimistic cache update so unlocked state shows instantly after navigation
              queryClient.setQueriesData(
                { queryKey: ["unlocked-properties", user.id] },
                (old: unknown) => {
                  const next = old instanceof Set ? new Set(old) : new Set<string>();
                  next.add(unlockedLegacy);
                  return next;
                }
              );
              queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
              markConfirmedLocal(unlockedLegacy);
              queueUnlockToast(unlockedLegacy);
              const newParams = new URLSearchParams(searchParams);
              newParams.delete("unlocked");
              setSearchParams(newParams, { replace: true });
              return;
            }
          } catch (e) {
            console.error("[Leads] handle-unlock (legacy return):", e);
          }
        }

        for (let i = 0; i < 20 && !cancelled; i++) {
          const { data, error } = await supabase.rpc("fn_check_unlocked_batch", {
            p_user_id: user.id,
            p_property_ids: [unlockedLegacy],
          });
          const ok =
            !error &&
            Array.isArray(data) &&
            data.some((row: { property_id: string }) => row.property_id === unlockedLegacy);
          if (ok) {
            clearPendingStripeUnlockCheckout();
            // Optimistic cache update so unlocked state shows instantly after navigation
            queryClient.setQueriesData(
              { queryKey: ["unlocked-properties", user.id] },
              (old: unknown) => {
                const next = old instanceof Set ? new Set(old) : new Set<string>();
                next.add(unlockedLegacy);
                return next;
              }
            );
            queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
            markConfirmedLocal(unlockedLegacy);
            queueUnlockToast(unlockedLegacy);
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("unlocked");
            setSearchParams(newParams, { replace: true });
            return;
          }
          await wait(1200);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (searchParams.get("checkout")) return;
    if (!propertyIdParam) return;
    if (isLoading) return;

    setSelectedPropertyId(propertyIdParam);

    const newParams = new URLSearchParams(searchParams);
    newParams.delete("propertyId");
    setSearchParams(newParams, { replace: true });
  }, [searchParams, isLoading, setSearchParams, toast, user?.id, queryClient]);

  // When tab regains focus, check if a Stripe single-unlock checkout completed in another tab
  useEffect(() => {
    const handleFocus = async () => {
      if (!user?.id) return;
      const pending = getPendingStripeUnlock();
      if (!pending) return;

      try {
        const { data: unlockData, error: unlockErr } = await supabase.functions.invoke<{
          success?: boolean;
          property_id?: string;
        }>("handle-unlock", {
          body: { stripe_session_id: pending.sessionId },
        });

        if (!unlockErr && unlockData?.success) {
          clearPendingStripeUnlockCheckout();
          queryClient.setQueryData(["optimistic-unlocked", user.id], (old: unknown) => {
            const next = old instanceof Set ? new Set(old) : new Set<string>();
            next.add(pending.propertyId);
            return next;
          });
          queryClient.setQueryData(["confirmed-unlocked-local", user.id], (old: unknown) => {
            const next = old instanceof Set ? new Set(old) : new Set<string>();
            next.add(pending.propertyId);
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
          queryClient.invalidateQueries({ queryKey: ["free-unlocks"] });
          queryClient.invalidateQueries({ queryKey: ["credits"] });
          setSelectedPropertyId(pending.propertyId);
          toast({
            title: "Property unlocked! 🔓",
            description: "Full addresses and contacts are now available.",
          });
        }
      } catch (e) {
        console.error("[Leads] focus-based unlock check failed:", e);
      }
    };

    window.addEventListener("focus", handleFocus);
    // Also check immediately on mount in case user already returned
    handleFocus();
    return () => window.removeEventListener("focus", handleFocus);
  }, [user?.id, queryClient, toast]);

  // When tab regains focus, check if a Stripe subscription/bulk checkout completed in another tab
  useEffect(() => {
    const handleFocusCheckout = async () => {
      if (!user?.id) return;
      const pending = getPendingStripeCheckout();
      if (!pending) return;

      console.log("[Leads] Detected pending Stripe checkout return:", pending.type);

      let synced = false;

      if (pending.type === "subscription") {
        // Call verify-subscription to ensure backend is synced
        try {
          const { data } = await supabase.functions.invoke("verify-subscription", { method: "POST", body: {} });
          synced = !!data?.synced;
        } catch (e) {
          console.error("[Leads] verify-subscription error:", e);
        }
      }

      // Invalidate all relevant queries so the UI refreshes
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["subscription", user.id] }),
        queryClient.refetchQueries({ queryKey: ["subscription-usage", user.id] }),
        queryClient.refetchQueries({ queryKey: ["credits", "balance"] }),
        queryClient.refetchQueries({ queryKey: ["user", "credits"] }),
        queryClient.refetchQueries({ queryKey: ["free-unlocks"] }),
        queryClient.refetchQueries({ queryKey: ["trial-status"] }),
      ]);

      if (pending.type === "subscription") {
        const currentSubscription = queryClient.getQueryData<{ plan_name?: string }>(["subscription", user.id]);
        if (pending.expectedTier) {
          synced = currentSubscription?.plan_name === pending.expectedTier;
        } else {
          synced = synced || !!currentSubscription?.plan_name;
        }
      } else {
        const currentBalance = Number(queryClient.getQueryData<number>(["credits", "balance"]) ?? 0);
        // If we know the expected credit count (e.g. bought 5k pack), confirm the balance
        // actually reached that amount — prevents clearing the pending state prematurely
        // when the user already had some credits before purchasing.
        synced = pending.expectedBalance
          ? currentBalance >= pending.expectedBalance
          : currentBalance > 0;
      }

      if (!synced) return;

      clearPendingStripeCheckout();

      toast({
        title: pending.type === "subscription" ? "Subscription activated! 🎉" : "Credits added! 💰",
        description: pending.type === "subscription"
          ? "Your plan is now active. Enjoy your monthly credits!"
          : "Your bulk credits are now available.",
      });
    };

    window.addEventListener("focus", handleFocusCheckout);
    handleFocusCheckout();
    return () => window.removeEventListener("focus", handleFocusCheckout);
  }, [user?.id, queryClient, toast]);

  // Map now uses viewport-based loading - no pre-fetching needed

  // Show toast notifications for errors
  useEffect(() => {
    if (error) {
      console.error("[Leads] Properties error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      const isAmbiguity = msg.includes('PGRST203') || msg.includes('ambiguous');
      toast({
        title: isAmbiguity ? "Temporary backend issue" : "Failed to load properties",
        description: isAmbiguity
          ? "The server is updating. Please refresh the page in a moment."
          : "Please try refreshing the page or check your connection.",
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

  const handlePropertyClick = useCallback((id: string) => {
    setSelectedPropertyId(id);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setLastSeenDays(null);
    setSelectedCity(null);
    setSelectedState(null);
    setSelectedSignal(null);
    setOpenViolationsOnly(false); // Show all violations by default
    setMultipleViolationsOnly(false);
    setRepeatOffenderOnly(false);
    setPage(1); // Reset to first page when clearing filters
    setSelectedIds([]); // Clear selection when filters change
    setSelectMode("page"); // Reset selection mode
  }, []);

  const handleAiFilters = useCallback((filters: Partial<LeadFilters>) => {
    handleClearFilters();
    if (filters.state) setSelectedState(filters.state);
    if (filters.cities?.length) setSelectedCity(filters.cities[0]);
    if (filters.openViolationsOnly) setOpenViolationsOnly(true);
    if (filters.multipleViolationsOnly) setMultipleViolationsOnly(true);
    if (filters.repeatOffenderOnly) setRepeatOffenderOnly(true);
    if (filters.lastSeenDays) setLastSeenDays(filters.lastSeenDays);
    if (filters.violationType) setSelectedSignal(filters.violationType);
    if (filters.sortBy) setSortBy(filters.sortBy as SortOption);
    setPage(1);
  }, [handleClearFilters]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSelectMode("page");
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => (prev.length === properties.length ? [] : properties.map((p) => p.id)));
    setSelectMode("page");
  }, [properties]);

  // Three-mode selection handlers
  const handleSelectVisible = useCallback(() => {
    setSelectedIds(properties.map((p) => p.id));
    setSelectMode("page");
  }, [properties]);

  const handleSelectCustomAmount = useCallback(async (amount: number) => {
    setSelectMode("custom");
    try {
      const filtersObj = filters as LeadFilters;
      const ids = await fetchFilteredPropertyIdsForSelection(filtersObj, amount);
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
    try {
      const filtersObj = filters as LeadFilters;
      const fetchAmount = Math.min(amount, totalCount, 25000); // Cap at 25k
      const ids = await fetchFilteredPropertyIdsForSelection(filtersObj, fetchAmount);
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
  // Only show limit warnings for subscription users; non-subscribers can always PAYG or use free unlocks
  const exportRemaining = hasActiveSubscription ? getRemainingCount("exports") : null;

  // Total available credits across all sources
  const totalAvailableCredits = isElitePlan
    ? Number.POSITIVE_INFINITY
    : (hasActiveSubscription ? (getRemainingCount("exports") ?? 0) : 0)
      + freeUnlocksRemaining
      + bulkCreditBalance;
  const hasNoCredits = !isElitePlan && totalAvailableCredits <= 0;

  const handleExportCSV = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select properties to export",
        variant: "destructive",
      });
      return;
    }

    // === CREDIT PRE-CHECK ===
    // Block export immediately if user has zero credits of any kind
    if (hasNoCredits) {
      setTrialGateType("exhausted");
      setTrialGateOpen(true);
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
        await Promise.all([
          refetchTrial(),
          queryClient.refetchQueries({ queryKey: ["unlocked-properties"] }),
        ]);

        const newRemaining = Math.max(0, trialExportsRemaining - propertyCount);
        toast({
          title: "Export Complete",
          description: `Exported ${propertyCount.toLocaleString()} properties — ${newRemaining} trial exports remaining`,
        });

        setSelectedIds([]);
      } catch (error: unknown) {
        console.error("[Leads] Trial export error:", error);
        const msg = error instanceof Error ? error.message : "";
        if (msg === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
          setTrialGateType("exhausted");
          setTrialGateOpen(true);
        } else if (msg === "TRIAL_EXPIRED") {
          setTrialGateType("expired");
          setTrialGateOpen(true);
        } else {
          const t = getExportErrorToast(error);
          toast({ title: t.title, description: t.description, variant: t.variant });
        }
        await refetchTrial();
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // === PAID SUBSCRIPTION EXPORT FLOW ===
    // Only enforce client-side export limits for active subscribers.
    // Non-subscribers (free unlock / PAYG / bulk) are gated server-side.
    if (hasActiveSubscription) {
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
              await Promise.all([
                refetchSubscription(),
                queryClient.refetchQueries({ queryKey: ["unlocked-properties"] }),
              ]);
              toast({
                title: "Export Complete",
                description: `Exported ${partialIds.length.toLocaleString()} properties`,
              });
              setSelectedIds([]);
            } catch (err: unknown) {
              const t = getExportErrorToast(err);
              toast({ title: t.title, description: t.description, variant: t.variant });
            } finally {
              setIsExporting(false);
            }
          },
        });
        setShowUpgradePrompt(true);
        return;
      }
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
      await Promise.all([
        refetchSubscription(),
        queryClient.refetchQueries({ queryKey: ["unlocked-properties"] }),
      ]);

      toast({
        title: "Export Complete",
        description: `Exported ${selectedIds.length.toLocaleString()} properties`,
      });

      setSelectedIds([]);
    } catch (error: unknown) {
      console.error("[Leads] Export error:", error);
      const msg = error instanceof Error ? error.message : "";

      if (msg === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
        setTrialGateType("exhausted");
        setTrialGateOpen(true);
        return;
      }
      if (msg === "TRIAL_EXPIRED") {
        setTrialGateType("expired");
        setTrialGateOpen(true);
        return;
      }
      if (msg === EXPORT_LIMIT_EXCEEDED) {
        const t = getExportErrorToast(error);
        toast({ title: t.title, description: t.description, variant: t.variant });
        // Server rejected — build context for partial export (or upgrade when remaining is 0)
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
              await Promise.all([
                refetchSubscription(),
                queryClient.refetchQueries({ queryKey: ["unlocked-properties"] }),
              ]);
              toast({
                title: "Export Complete",
                description: `Exported ${partialIds.length.toLocaleString()} properties`,
              });
              setSelectedIds([]);
            } catch (err: unknown) {
              const t = getExportErrorToast(err);
              toast({ title: t.title, description: t.description, variant: t.variant });
            } finally {
              setIsExporting(false);
            }
          },
        });
        setShowUpgradePrompt(true);
        return;
      }

      const t = getExportErrorToast(error);
      toast({ title: t.title, description: t.description, variant: t.variant });
    } finally {
      setIsExporting(false);
    }
  };

  // Fetch violations for all properties (enables instant PropertyDetailPanel)
  // Memoize propertyIds to prevent query cache invalidation on every render
  const propertyIds = useMemo(() => properties.map((p) => p.id), [properties]);
  const unlockCheckIds = useMemo(() => {
    const ids = [...propertyIds];
    if (selectedPropertyId && !ids.includes(selectedPropertyId)) {
      ids.push(selectedPropertyId);
    }
    return ids;
  }, [propertyIds, selectedPropertyId]);
  const { unlockedSet, confirmedUnlockedSet, invalidate: invalidateUnlocks } = useUnlockedProperties(unlockCheckIds);
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
    staleTime: 2 * 60 * 1000, // 2 minutes - increased from 30s for better caching
    gcTime: 5 * 60 * 1000, // 5 minutes - keep cached data longer
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

  // If the selected property is not on the current paginated results, fetch it by id
  // so the details panel can show SnapScore / Violation Type / SnapInsight immediately.
  const {
    data: selectedPropertyData,
    error: selectedPropertyError,
  } = useQuery({
    queryKey: ["selected-property", selectedPropertyId],
    enabled: !!selectedPropertyId && (selectedProperty == null),
    queryFn: async () => {
      if (!selectedPropertyId) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, city, state, zip, snap_score, snap_insight, latitude, longitude, updated_at")
        .eq("id", selectedPropertyId)
        .single();

      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!selectedPropertyError) return;
    console.error("[Leads] Selected property error:", selectedPropertyError);
  }, [selectedPropertyError]);

  const selectedPropertyWithFetched = useMemo(() => {
    if (!selectedPropertyId) return null;
    if (selectedProperty) return selectedProperty;
    if (!selectedPropertyData) return null;
    return {
      ...(selectedPropertyData as any),
      violations: [],
    };
  }, [selectedProperty, selectedPropertyData, selectedPropertyId]);

  // Show unlock toast only when the property is actually available in UI.
  useEffect(() => {
    if (!unlockToastPendingId) return;
    if (!selectedPropertyWithFetched) return;
    if (selectedPropertyWithFetched.id !== unlockToastPendingId) return;
    // Only toast after the unlock is confirmed (DB-backed), not optimistic.
    if (!confirmedUnlockedSet.has(unlockToastPendingId)) return;

    toast({
      title: "Property unlocked! 🔓",
      description: "Full address and contacts are now available.",
    });
    setUnlockToastPendingId(null);
  }, [unlockToastPendingId, selectedPropertyWithFetched, confirmedUnlockedSet, toast]);

  // Determine if user should be gated (expired trial or cancelled subscription, no active paid plan)
  const isCancelled = subscriptionStatus === "cancelled" || subscriptionStatus === "expired";
  // Elite users are never gated
  const isFullyGated = !isElitePlan && (hasTrialExpired || isCancelled) && !hasActiveSubscription;

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

        {/* DESKTOP: Collapsible filter bar */}
        <div className="hidden md:block border-b bg-background">
          {/* Always-visible row: Search + Freshness + Map/List toggle */}
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="flex-1 min-w-0">
              <AiSearchBar onFiltersApplied={handleAiFilters} />
            </div>
            <div className="hidden lg:flex items-center gap-2 shrink-0 pr-2">
              <FreshnessIndicator />
            </div>
            {/* Map / List view toggle */}
            <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0 mr-2">
              <button
                onClick={() => setDesktopView("map")}
                className={`flex items-center gap-1 px-2 h-7 text-xs font-medium transition-colors ${
                  desktopView === "map"
                    ? "bg-[#0d9e75] text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title="Map view"
              >
                <MapIcon className="h-3.5 w-3.5" />
                Map
              </button>
              <button
                onClick={() => setDesktopView("list")}
                className={`flex items-center gap-1 px-2 h-7 text-xs font-medium transition-colors ${
                  desktopView === "list"
                    ? "bg-[#0d9e75] text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
            </div>
          </div>

          {/* Search + Filters row — only shown in list-only view on desktop */}
          {desktopView === "list" && (
            <div className="flex items-center gap-2 px-4 py-1.5 min-w-0">
              <div className="relative w-44">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-8 h-7 text-xs"
                />
              </div>
              <Button
                variant={filtersExpanded ? "secondary" : "outline"}
                size="sm"
                onClick={toggleFilters}
                className="h-7 px-2.5 text-xs gap-1.5 shrink-0"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 bg-[#0d9e75] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          )}

          {/* Expandable filter controls — only in list view (map view has its own) */}
          {desktopView === "list" && filtersExpanded && (
            <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border/50 flex-wrap min-w-0 overflow-hidden">
              <EnforcementAreaFilter
                selectedCity={selectedCity}
                selectedState={selectedState}
                onCityChange={(c) => { setSelectedCity(c); setPage(1); }}
                onStateChange={(s) => { setSelectedState(s); setPage(1); }}
              />
              <TimeFilter
                lastSeenDays={lastSeenDays}
                onLastSeenChange={(v) => { setLastSeenDays(v); setPage(1); }}
              />
              <EnforcementSignalsFilter
                selectedSignal={selectedSignal}
                onSignalChange={(v) => { setSelectedSignal(v); setPage(1); if (v) setSearchInput(""); }}
                selectedState={selectedState}
                selectedCity={selectedCity}
              />
              {canUsePressureLevelFilters ? (
                <PressureLevelFilter
                  openViolationsOnly={openViolationsOnly}
                  onOpenViolationsChange={(v) => { setOpenViolationsOnly(v); setPage(1); }}
                  multipleViolationsOnly={multipleViolationsOnly}
                  onMultipleViolationsChange={(v) => { setMultipleViolationsOnly(v); setPage(1); }}
                  repeatOffenderOnly={repeatOffenderOnly}
                  onRepeatOffenderChange={(v) => { setRepeatOffenderOnly(v); setPage(1); }}
                />
              ) : (
                <a
                  href="/pricing"
                  className="flex items-center gap-1.5 px-2 py-1 rounded border border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Lock className="h-3 w-3" />
                  Pressure Level™
                </a>
              )}
            </div>
          )}
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
        <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
          {/* Map - Left Side (hidden in list view) */}
          {desktopView === "map" && (
            <div className="w-[45%] border-r relative flex flex-col">
              {/* Search + Filters inside map column */}
              <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-background shrink-0">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-8 h-7 text-xs"
                  />
                </div>
                <Button
                  variant={filtersExpanded ? "secondary" : "outline"}
                  size="sm"
                  onClick={toggleFilters}
                  className="h-7 px-2.5 text-xs gap-1.5 shrink-0"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 bg-[#0d9e75] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    <X className="h-3 w-3" /> Clear
                  </Button>
                )}
              </div>
              {/* Expandable filters inside map column */}
              {filtersExpanded && (
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50 flex-wrap bg-background shrink-0">
                  <EnforcementAreaFilter
                    selectedCity={selectedCity}
                    selectedState={selectedState}
                    onCityChange={(c) => { setSelectedCity(c); setPage(1); }}
                    onStateChange={(s) => { setSelectedState(s); setPage(1); }}
                  />
                  <TimeFilter
                    lastSeenDays={lastSeenDays}
                    onLastSeenChange={(v) => { setLastSeenDays(v); setPage(1); }}
                  />
                  <EnforcementSignalsFilter
                    selectedSignal={selectedSignal}
                    onSignalChange={(v) => { setSelectedSignal(v); setPage(1); if (v) setSearchInput(""); }}
                    selectedState={selectedState}
                    selectedCity={selectedCity}
                  />
                  {canUsePressureLevelFilters ? (
                    <PressureLevelFilter
                      openViolationsOnly={openViolationsOnly}
                      onOpenViolationsChange={(v) => { setOpenViolationsOnly(v); setPage(1); }}
                      multipleViolationsOnly={multipleViolationsOnly}
                      onMultipleViolationsChange={(v) => { setMultipleViolationsOnly(v); setPage(1); }}
                      repeatOffenderOnly={repeatOffenderOnly}
                      onRepeatOffenderChange={(v) => { setRepeatOffenderOnly(v); setPage(1); }}
                    />
                  ) : (
                    <a
                      href="/pricing"
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                      <Lock className="h-3 w-3" />
                      Pressure Level™
                    </a>
                  )}
                </div>
              )}
              <div className="flex-1 relative min-h-0">
                <LeadsMap
                  filters={filters as LeadFilters}
                  onPropertyClick={handlePropertyClick}
                  selectedPropertyId={selectedPropertyId || undefined}
                  unlockedSet={unlockedSet}
                />
              </div>
            </div>
          )}

          {/* Property List — full width in list view, 40% in map view */}
          <div className={`${desktopView === "list" ? "w-full" : "w-[55%]"} flex flex-col relative min-h-0 h-full`}>
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
                  onClick={hasNoCredits ? () => { setTrialGateType("exhausted"); setTrialGateOpen(true); } : handleExportCSV}
                  disabled={selectedIds.length === 0 || isExporting}
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 text-xs ${hasNoCredits ? "opacity-50" : ""}`}
                  title={hasNoCredits ? "Get credits to export" : undefined}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {hasNoCredits ? "Get Credits" : "Export"}
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
                  onPropertyClick={handlePropertyClick}
                  savedSet={savedSet}
                  onToggleSaved={toggleSaved}
                  unlockedSet={unlockedSet}
                  onUnlock={(id) => {
                    const prop = mappedProperties.find(p => p.id === id);
                    if (prop) setUnlockModalProperty(prop);
                  }}
                  compact={desktopView === "list"}
                />
              )}
            </div>

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
              page={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
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
                onPropertyClick={handlePropertyClick}
                selectedPropertyId={selectedPropertyId || undefined}
                unlockedSet={unlockedSet}
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
                            onClick={hasNoCredits ? () => { setTrialGateType("exhausted"); setTrialGateOpen(true); } : handleExportCSV}
                            disabled={isExporting}
                            className={`h-8 text-xs gap-1 ${hasNoCredits ? "opacity-60" : ""}`}
                          >
                            {isExporting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            {hasNoCredits ? "Get Credits" : `Export (${selectedIds.length.toLocaleString()})`}
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
                    onPropertyClick={handlePropertyClick}
                    savedSet={savedSet}
                    onToggleSaved={toggleSaved}
                    unlockedSet={unlockedSet}
                    onUnlock={(id) => {
                      const prop = mappedProperties.find((p) => p.id === id);
                      if (prop) setUnlockModalProperty(prop);
                    }}
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
        {selectedPropertyWithFetched && !isMobile && (
          <PropertyDetailPanel
            property={selectedPropertyWithFetched}
            open={true}
            onOpenChange={(open) => !open && setSelectedPropertyId(null)}
            isUnlocked={selectedPropertyWithFetched ? unlockedSet.has(selectedPropertyWithFetched.id) : true}
            onUnlock={(id) => {
              const prop = mappedProperties.find(p => p.id === id);
              if (prop) setUnlockModalProperty(prop);
            }}
          />
        )}

        {selectedPropertyWithFetched && isMobile && (
          <MobilePropertyDetailSheet
            property={selectedPropertyWithFetched}
            open={!!selectedPropertyId}
            onOpenChange={(open) => !open && setSelectedPropertyId(null)}
            isUnlocked={selectedPropertyWithFetched ? unlockedSet.has(selectedPropertyWithFetched.id) : true}
            onUnlock={(id) => {
              const prop = mappedProperties.find(p => p.id === id);
              if (prop) setUnlockModalProperty(prop);
            }}
            isSaved={selectedPropertyWithFetched ? savedSet.has(selectedPropertyWithFetched.id) : false}
            onToggleSaved={toggleSaved}
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

        {/* Bulk Unlock Bar - shows when locked properties are selected */}
        <BulkUnlockBar
          selectedIds={selectedIds}
          unlockedSet={unlockedSet}
          onUnlocked={invalidateUnlocks}
          onGetCredits={() => {
            const firstLockedId = selectedIds.find((id) => !unlockedSet.has(id));
            const prop = mappedProperties.find((item) => item.id === firstLockedId);
            if (prop) setUnlockModalProperty(prop);
          }}
        />

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

      {/* Unlock Modal */}
      <UnlockModal
        open={!!unlockModalProperty}
        onOpenChange={(open) => !open && setUnlockModalProperty(null)}
        property={unlockModalProperty}
        freeUnlocksRemaining={freeUnlocksRemaining}
        onUnlocked={invalidateUnlocks}
      />

      {/* View Limit Modal */}
      <ViewLimitModal
        open={viewLimitModalOpen}
        onOpenChange={setViewLimitModalOpen}
        viewCount={viewCount}
        viewLimit={viewLimit}
      />
    </AppLayout>
  );
}

export default Leads;
