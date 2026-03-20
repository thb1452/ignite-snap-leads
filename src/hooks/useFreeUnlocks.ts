import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

/**
 * Hook to get the current user's free unlocks remaining.
 */
export function useFreeUnlocks() {
  const { user } = useAuth();

  const { data: freeUnlocksRemaining = 3, isLoading } = useQuery({
    queryKey: ["free-unlocks", user?.id],
    queryFn: async () => {
      if (!user?.id) return 3;
      const { data, error } = await supabase
        .from("profiles")
        .select("free_unlocks_remaining")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("[useFreeUnlocks] Error:", error);
        return 3;
      }

      return data?.free_unlocks_remaining ?? 3;
    },
    enabled: !!user?.id,
    staleTime: 15000,
  });

  return { freeUnlocksRemaining, isLoading };
}
