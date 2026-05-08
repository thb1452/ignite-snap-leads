import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/hooks/use-auth";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reads the current user's unseen, undismissed watchlist_intelligence_events
 * from the last 7 days via the RLS-scoped client (auth.uid() = user_id).
 *
 * Defensive against missing-table / RLS-denied errors so the hook is safe
 * to mount in environments where P1.5 hasn't been applied yet.
 */
export function useWatchlistChangeCount() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["watchlist-change-count", userId],
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
      // Cast to `never` because the generated supabase types do not yet
      // include P1.5 tables (watchlist_intelligence_events). Once
      // `supabase gen types` is re-run the cast can be removed.
      const { count, error } = await supabase
        .from("watchlist_intelligence_events" as never)
        .select("id", { count: "exact", head: true })
        .is("seen_at", null)
        .is("dismissed_at", null)
        .gte("created_at", sevenDaysAgo.toISOString());

      if (error) {
        // 42P01 = undefined_table (P1.5 not applied yet)
        // 42501 = insufficient_privilege (RLS deny)
        const code = (error as { code?: string }).code;
        if (code === "42P01" || code === "42501") {
          return 0;
        }
        // Don't throw — a broken count shouldn't break the dashboard
        console.warn("[useWatchlistChangeCount] query failed:", error);
        return 0;
      }
      return count ?? 0;
    },
  });
}
