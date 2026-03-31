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

  // Elite users: return a set containing all property IDs (everything unlocked)
  const eliteSet = useMemo(
    () => (isElitePlan ? new Set<string>(propertyIds) : new Set<string>()),
    [isElitePlan, propertyIds]
  );

  const { data: fetchedSet = new Set<string>(), isLoading } = useQuery({
    queryKey: ["unlocked-properties", user?.id, propertyIds.sort().join(",")],
    queryFn: async () => {
      if (!user?.id || propertyIds.length === 0) return new Set<string>();

      const { data, error } = await supabase.rpc("fn_check_unlocked_batch", {
        p_user_id: user.id,
        p_property_ids: propertyIds,
      });

      if (error) {
        console.error("[useUnlockedProperties] Error:", error);
        return new Set<string>();
      }

      return new Set((data as { property_id: string }[]).map((r) => r.property_id));
    },
    // Skip the RPC entirely for Elite users — they have everything unlocked
    enabled: !!user?.id && propertyIds.length > 0 && !isElitePlan,
    staleTime: 30000,
  });

  const unlockedSet = isElitePlan ? eliteSet : fetchedSet;

  const isUnlocked = useCallback(
    (propertyId: string) => isElitePlan || unlockedSet.has(propertyId),
    [unlockedSet, isElitePlan]
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
  }, [queryClient]);

  return { unlockedSet, isUnlocked, isLoading: isElitePlan ? false : isLoading, invalidate };
}
