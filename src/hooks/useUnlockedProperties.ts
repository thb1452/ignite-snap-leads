import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useFeatureAccess } from "./useFeatureAccess";

/**
 * Hook to manage unlocked properties for the current user.
 * Elite plan users have ALL properties auto-unlocked.
 * Provides batch checking and single-property unlock status.
 */
export function useUnlockedProperties(propertyIds: string[] = []) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isElitePlan } = useFeatureAccess();

  const { data: optimisticSet = new Set<string>() } = useQuery({
    queryKey: ["optimistic-unlocked", user?.id],
    queryFn: async () => new Set<string>(),
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: new Set<string>(),
  });

  const { data: confirmedLocalSet = new Set<string>() } = useQuery({
    queryKey: ["confirmed-unlocked-local", user?.id],
    queryFn: async () => new Set<string>(),
    enabled: !!user?.id,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: new Set<string>(),
  });

  const propertyIdsKey = useMemo(() => {
    if (!propertyIds?.length) return "";
    // Do NOT mutate the caller's array
    return [...propertyIds].sort().join(",");
  }, [propertyIds]);

  const sortedPropertyIds = useMemo(() => {
    if (!propertyIds?.length) return [];
    return propertyIdsKey ? propertyIdsKey.split(",") : [...propertyIds].sort();
  }, [propertyIds, propertyIdsKey]);

  // Elite users: return a set containing all property IDs (everything unlocked)
  const eliteSet = useMemo(
    () => (isElitePlan ? new Set<string>(propertyIds) : new Set<string>()),
    [isElitePlan, propertyIds]
  );

  const { data: fetchedSet = new Set<string>(), isLoading } = useQuery({
    queryKey: ["unlocked-properties", user?.id, propertyIdsKey],
    queryFn: async () => {
      if (!user?.id || sortedPropertyIds.length === 0) return new Set<string>();

      const { data, error } = await supabase.rpc("fn_check_unlocked_batch", {
        p_user_id: user.id,
        p_property_ids: sortedPropertyIds,
      });

      if (error) {
        console.error("[useUnlockedProperties] Error:", error);
        return new Set<string>();
      }

      return new Set((data as { property_id: string }[]).map((r) => r.property_id));
    },
    // Skip the RPC entirely for Elite users — they have everything unlocked
    enabled: !!user?.id && sortedPropertyIds.length > 0 && !isElitePlan,
    // We want unlocked state to reflect quickly after navigation.
    // The unlock flow also performs an optimistic cache update.
    staleTime: 5000,
    refetchOnMount: true,
  });

  const unlockedSet = useMemo(() => {
    if (isElitePlan) return eliteSet;
    if (!optimisticSet || optimisticSet.size === 0) return fetchedSet;
    const merged = new Set<string>(fetchedSet);
    for (const id of optimisticSet) merged.add(id);
    return merged;
  }, [isElitePlan, eliteSet, fetchedSet, optimisticSet]);

  // "Confirmed" means it came from the DB check (not optimistic local state).
  // Elite users are treated as confirmed to avoid extra gates.
  const confirmedUnlockedSet = useMemo(() => {
    if (isElitePlan) return eliteSet;
    if (!confirmedLocalSet || confirmedLocalSet.size === 0) return fetchedSet;
    const merged = new Set<string>(fetchedSet);
    for (const id of confirmedLocalSet) merged.add(id);
    return merged;
  }, [isElitePlan, eliteSet, fetchedSet, confirmedLocalSet]);

  const isUnlocked = useCallback(
    (propertyId: string) => isElitePlan || unlockedSet.has(propertyId),
    [unlockedSet, isElitePlan]
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
  }, [queryClient]);

  return {
    unlockedSet,
    confirmedUnlockedSet,
    isUnlocked,
    isLoading: isElitePlan ? false : isLoading,
    invalidate,
  };
}
