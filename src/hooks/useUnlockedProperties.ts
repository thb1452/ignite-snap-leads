import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

/**
 * Hook to manage unlocked properties for the current user.
 * Provides batch checking and single-property unlock status.
 */
export function useUnlockedProperties(propertyIds: string[] = []) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: unlockedSet = new Set<string>(), isLoading } = useQuery({
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
    enabled: !!user?.id && propertyIds.length > 0,
    staleTime: 30000,
  });

  const isUnlocked = useCallback(
    (propertyId: string) => unlockedSet.has(propertyId),
    [unlockedSet]
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
  }, [queryClient]);

  return { unlockedSet, isUnlocked, isLoading, invalidate };
}
