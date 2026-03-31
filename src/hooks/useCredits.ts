import { useQuery } from "@tanstack/react-query";
import { getCreditBalance } from "@/services/credits";
import { useSubscription } from "@/hooks/useSubscription";

export function useCreditBalance() {
  const { hasActiveSubscription, plan, usage, loading: subscriptionLoading } = useSubscription();

  const ledgerQuery = useQuery({
    queryKey: ["credits", "balance"],
    queryFn: getCreditBalance,
    retry: 1, // Only retry once to prevent infinite loops
    staleTime: 30000,
  });

  // If the user has an active subscription plan, treat their remaining monthly exports as "credits remaining"
  // (this matches the Settings "CSV Exports 0/150" display).
  if (hasActiveSubscription && plan && usage && !subscriptionLoading) {
    const limit = plan.max_monthly_exports;
    const used = usage.exports_count ?? 0;
    const remaining = limit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
    return {
      ...ledgerQuery,
      data: remaining,
      isLoading: false,
    };
  }

  return ledgerQuery;
}
