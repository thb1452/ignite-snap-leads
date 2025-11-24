import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminJurisdiction {
  id: string;
  name: string;
  location: string;
  source: string;
  lastUpload: string;
  activeCount: number;
  totalCount: number;
  flag: string;
  flagColor: string;
}

export function useAdminJurisdictions(refreshTrigger?: Date) {
  return useQuery({
    queryKey: ["admin-jurisdictions", refreshTrigger],
    queryFn: async (): Promise<AdminJurisdiction[]> => {
      const { data: jurisdictions, error } = await supabase
        .from("jurisdictions")
        .select("*");

      if (error) throw error;

      // Get property counts for each jurisdiction
      const jurisdictionsWithCounts = await Promise.all(
        (jurisdictions || []).map(async (jurisdiction) => {
          const { count: totalCount } = await supabase
            .from("properties")
            .select("*", { count: "exact", head: true })
            .eq("jurisdiction_id", jurisdiction.id);

          // Get last upload date
          const { data: lastUpload } = await supabase
            .from("upload_jobs")
            .select("created_at")
            .eq("jurisdiction_id", jurisdiction.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          return {
            id: jurisdiction.id,
            name: jurisdiction.name,
            location: `${jurisdiction.city}, ${jurisdiction.state}`,
            source: "Database",
            lastUpload: lastUpload?.created_at || new Date().toISOString(),
            activeCount: totalCount || 0,
            totalCount: totalCount || 0,
            flag: totalCount && totalCount > 100 ? "High-value" : "Active",
            flagColor: totalCount && totalCount > 100 ? "bg-purple-600" : "bg-green-600",
          };
        })
      );

      return jurisdictionsWithCounts;
    },
    refetchInterval: 30000,
  });
}
