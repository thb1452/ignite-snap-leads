import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";

interface MonthlyViolationStats {
  count: number;
  formattedCount: string;
}

export function useWeeklyViolationCount() {
  return useQuery<MonthlyViolationStats>({
    queryKey: ["monthly-violation-count"],
    queryFn: async () => {
      // Count violations created in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count, error } = await supabase
        .from("violations")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo.toISOString());
      
      if (error) {
        console.error("[useMonthlyViolationCount] Error:", error);
        throw error;
      }
      
      const violationCount = count ?? 0;
      
      // Format the count - round to nearest hundred if over 1k
      let formattedCount: string;
      if (violationCount >= 1000) {
        const rounded = Math.round(violationCount / 100) * 100;
        formattedCount = `${rounded.toLocaleString()}+`;
      } else {
        formattedCount = violationCount.toLocaleString();
      }
      
      return {
        count: violationCount,
        formattedCount
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
