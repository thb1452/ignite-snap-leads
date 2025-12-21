import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OpportunityFunnel {
  opportunity_class: string;
  property_count: number;
  avg_score: number;
}

export interface HotProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  snap_score: number;
  snap_insight: string | null;
  distress_signals: string[];
  total_violations: number;
  oldest_violation_date: string | null;
  escalated: boolean;
  multi_department: boolean;
}

export interface JurisdictionStats {
  jurisdiction_id: string;
  jurisdiction_name: string;
  city: string;
  state: string;
  enforcement_profile: {
    strictness: string;
    avg_violations_per_property: number;
    score_multiplier: number;
  };
  property_count: number;
  avg_score: number;
  distressed_count: number;
}

// Fetch opportunity funnel data using efficient database function
export function useOpportunityFunnel() {
  return useQuery({
    queryKey: ["opportunity-funnel"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_opportunity_funnel");

      if (error) {
        console.error("fn_opportunity_funnel error:", error);
        throw error;
      }

      return (data || []).map((row: any) => ({
        opportunity_class: row.opportunity_class,
        property_count: Number(row.property_count),
        avg_score: Number(row.avg_score),
      })) as OpportunityFunnel[];
    },
    staleTime: 30000, // Cache for 30 seconds
  });
}

// Fetch hot properties (top distressed) - already efficient with LIMIT
export function useHotProperties(limit = 10) {
  return useQuery({
    queryKey: ["hot-properties", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select(`
          id,
          address,
          city,
          state,
          snap_score,
          snap_insight,
          distress_signals,
          total_violations,
          oldest_violation_date,
          escalated,
          multi_department
        `)
        .not("snap_score", "is", null)
        .gte("snap_score", 70)
        .order("snap_score", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as HotProperty[];
    },
    staleTime: 30000,
  });
}

// Fetch jurisdiction statistics using efficient database function
export function useJurisdictionStats() {
  return useQuery({
    queryKey: ["jurisdiction-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_jurisdiction_stats");

      if (error) {
        console.error("fn_jurisdiction_stats error:", error);
        throw error;
      }

      return (data || []).map((row: any) => ({
        jurisdiction_id: row.jurisdiction_id,
        jurisdiction_name: row.jurisdiction_name,
        city: row.city,
        state: row.state,
        enforcement_profile: row.enforcement_profile || {
          strictness: "unknown",
          avg_violations_per_property: 0,
          score_multiplier: 1.0,
        },
        property_count: Number(row.property_count),
        avg_score: Number(row.avg_score),
        distressed_count: Number(row.distressed_count),
      })) as JurisdictionStats[];
    },
    staleTime: 30000,
  });
}

// Hook for dashboard stats using efficient database function
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dashboard_stats");

      if (error) {
        console.error("fn_dashboard_stats error:", error);
        throw error;
      }

      return data as {
        total_leads: number;
        hot_leads: number;
        avg_snap_score: number;
        distressed_count: number;
        value_add_count: number;
        watch_count: number;
        distressed_avg: number;
        value_add_avg: number;
        watch_avg: number;
      };
    },
    staleTime: 30000,
  });
}
