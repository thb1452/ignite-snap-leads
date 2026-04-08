import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { useAuth } from "./use-auth";

export function useFreeUnlocks() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["free-unlocks", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      try {
        const { data: row, error } = await withTimeout(
          supabase
            .from("profiles")
            .select("free_unlocks_remaining")
            .eq("user_id", user.id)
            .maybeSingle(),
          8000,
          'Free unlock lookup timed out',
        );

        if (error) {
          console.error("[useFreeUnlocks] Error:", error);
          return 0;
        }

        return row?.free_unlocks_remaining ?? 0;
      } catch (error) {
        console.error("[useFreeUnlocks] Request failed:", error);
        return 0;
      }
    },
    enabled: !!user?.id,
    staleTime: 15000,
    retry: 0,
  });

  const freeUnlocksRemaining = data !== undefined ? data : isLoading ? 3 : 0;

  return { freeUnlocksRemaining, isLoading };
}
