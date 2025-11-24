import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminStats {
  totalLeads: number;
  leadsToday: number;
  todayTrend?: string;
  leads7Days: number;
  leads30Days: number;
  activeJurisdictions: number;
  uploads24h: number;
  activeUsers: number;
  geocodingQueued: number;
  geocodingRunning: number;
  geocodingCompleted: number;
  geocodingPercent: number;
  failedUploads: number;
  failedGeocodes: number;
  stuckJobs: number;
}

export function useAdminStats(refreshTrigger?: Date) {
  return useQuery({
    queryKey: ["admin-stats", refreshTrigger],
    queryFn: async (): Promise<AdminStats> => {
      // Get total leads (properties)
      const { count: totalLeads } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true });

      // Get leads created today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: leadsToday } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      // Get leads from 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: leads7Days } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo.toISOString());

      // Get leads from 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { count: leads30Days } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo.toISOString());

      // Get active jurisdictions
      const { count: activeJurisdictions } = await supabase
        .from("jurisdictions")
        .select("*", { count: "exact", head: true });

      // Get uploads in last 24 hours
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const { count: uploads24h } = await supabase
        .from("upload_jobs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", twentyFourHoursAgo.toISOString());

      // Get active users (users with admin, va, or operator role)
      const { count: activeUsers } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true });

      // Get geocoding stats
      const { data: geocodingJobs } = await supabase
        .from("geocoding_jobs")
        .select("status, geocoded_count, failed_count, total_properties");

      let geocodingQueued = 0;
      let geocodingRunning = 0;
      let geocodingCompleted = 0;
      let totalProperties = 0;

      geocodingJobs?.forEach((job) => {
        totalProperties += job.total_properties || 0;
        geocodingCompleted += job.geocoded_count || 0;
        
        if (job.status === "pending") {
          geocodingQueued += (job.total_properties || 0) - (job.geocoded_count || 0) - (job.failed_count || 0);
        } else if (job.status === "processing") {
          geocodingRunning += (job.total_properties || 0) - (job.geocoded_count || 0) - (job.failed_count || 0);
        }
      });

      const geocodingPercent = totalProperties > 0 
        ? Math.round((geocodingCompleted / totalProperties) * 100 * 10) / 10
        : 0;

      // Get failed uploads (status = 'FAILED')
      const { count: failedUploads } = await supabase
        .from("upload_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", "FAILED");

      // Get failed geocodes
      const { data: failedGeocodingJobs } = await supabase
        .from("geocoding_jobs")
        .select("failed_count");

      const failedGeocodes = failedGeocodingJobs?.reduce(
        (sum, job) => sum + (job.failed_count || 0),
        0
      ) || 0;

      // Get stuck jobs (processing for more than 1 hour)
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const { count: stuckJobs } = await supabase
        .from("upload_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", "PROCESSING")
        .lt("started_at", oneHourAgo.toISOString());

      return {
        totalLeads: totalLeads || 0,
        leadsToday: leadsToday || 0,
        leads7Days: leads7Days || 0,
        leads30Days: leads30Days || 0,
        activeJurisdictions: activeJurisdictions || 0,
        uploads24h: uploads24h || 0,
        activeUsers: activeUsers || 0,
        geocodingQueued,
        geocodingRunning,
        geocodingCompleted,
        geocodingPercent,
        failedUploads: failedUploads || 0,
        failedGeocodes,
        stuckJobs: stuckJobs || 0,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
