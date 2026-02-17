import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";

interface EliteCapacity {
  totalSpots: number;
  spotsUsed: number;
  spotsRemaining: number;
  isFull: boolean;
}

async function fetchEliteCapacity(): Promise<EliteCapacity> {
  const totalSpots = 500;

  const { count, error } = await supabase
    .from("user_subscriptions")
    .select("id", { count: "exact", head: true })
    .in("status", ["active", "trialing", "trial"])
    .eq("trial_tier", "enterprise");

  if (error) {
    console.error("[useEliteCapacity] Error fetching elite count:", error);
    // Return safe defaults - show spots available so we don't block signups
    return { totalSpots, spotsUsed: 0, spotsRemaining: totalSpots, isFull: false };
  }

  // Also count users on the enterprise plan directly (not via trial_tier)
  const { count: planCount, error: planError } = await supabase
    .from("user_subscriptions")
    .select("id, plan:subscription_plans!inner(name)", { count: "exact", head: true })
    .in("status", ["active"])
    .eq("plan.name", "enterprise");

  const eliteTrialCount = count ?? 0;
  const elitePlanCount = planCount ?? 0;

  // Deduplicate: trial_tier='enterprise' users overlap with plan.name='enterprise'
  // Use the higher of the two counts as a conservative estimate
  const spotsUsed = Math.max(eliteTrialCount, elitePlanCount);
  const spotsRemaining = Math.max(0, totalSpots - spotsUsed);

  return {
    totalSpots,
    spotsUsed,
    spotsRemaining,
    isFull: spotsRemaining === 0,
  };
}

export function useEliteCapacity() {
  const { data, isLoading } = useQuery({
    queryKey: ["elite-capacity"],
    queryFn: fetchEliteCapacity,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // refresh every 10 min
  });

  return {
    ...(data ?? { totalSpots: 500, spotsUsed: 0, spotsRemaining: 500, isFull: false }),
    loading: isLoading,
  };
}
