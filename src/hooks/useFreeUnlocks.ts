import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

/**
 * Hook to get the current user's free unlocks remaining.
 */
export function useFreeUnlocks() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["free-unlocks", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data: row, error } = await supabase
        .from("profiles")
        .select("free_unlocks_remaining")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[useFreeUnlocks] Error:", error);
        return 0;
      }
      if (!row) return 0;
      return row.free_unlocks_remaining;
    },
    enabled: !!user?.id,
    staleTime: 15000,
  });

  // While loading, assume defaults match a normal account (avoids unlock UI flicker).
  const freeUnlocksRemaining =
    data !== undefined ? data : isLoading ? 3 : 0;

  return { freeUnlocksRemaining, isLoading };
}
