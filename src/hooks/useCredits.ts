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

  // For subscribers, total = remaining monthly quota + any bulk credits in the ledger.
  if (hasActiveSubscription && plan && usage && !subscriptionLoading) {
    const limit = plan.max_monthly_exports;
    const used = usage.exports_count ?? 0;
    const subRemaining = limit === -1 ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
    const bulkBalance = (ledgerQuery.data as number) ?? 0;
    const total = subRemaining === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : subRemaining + bulkBalance;
    return {
      ...ledgerQuery,
      data: total,
      isLoading: false,
    };
  }

  return ledgerQuery;
}
