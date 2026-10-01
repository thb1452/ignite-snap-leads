import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/hooks/use-auth";
import { CUSTOMER_RECORDS_AVAILABLE } from "@/lib/publicAvailability";
import { recordIngestionStats, recordIngestionWindow } from "@/lib/recordIngestionStats";

/** Historical filename retained for callers. This counts accessible imported rows over 30 days. */
export function useWeeklyViolationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["accessible-record-ingestion-count", user?.id],
    enabled: !!user && CUSTOMER_RECORDS_AVAILABLE,
    queryFn: async () => {
      const now = new Date();
      const { count, error } = await supabase
        .from("violations")
        .select("*", { count: "exact", head: true })
        .gte("created_at", recordIngestionWindow(now))
        .lte("created_at", now.toISOString());
      if (error) throw new Error("Record count unavailable");
      return recordIngestionStats(count, now);
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
