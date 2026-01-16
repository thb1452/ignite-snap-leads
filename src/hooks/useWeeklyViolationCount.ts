import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface WeeklyViolationStats {
  count: number;
  formattedCount: string;
}

export function useWeeklyViolationCount() {
  return useQuery<WeeklyViolationStats>({
    queryKey: ["weekly-violation-count"],
    queryFn: async () => {
      // Count violations created in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { count, error } = await supabase
        .from("violations")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo.toISOString());
      
      if (error) {
        console.error("[useWeeklyViolationCount] Error:", error);
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
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
