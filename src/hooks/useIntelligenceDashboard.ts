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

// Fetch opportunity funnel data
export function useOpportunityFunnel() {
  return useQuery({
    queryKey: ["opportunity-funnel"],
    queryFn: async () => {
      // Use raw query since the view might not be in types
      const { data, error } = await supabase
        .from("properties")
        .select("snap_score")
        .not("snap_score", "is", null);

      if (error) throw error;

      // Calculate funnel locally
      const funnel = {
        distressed: { count: 0, total: 0 },
        value_add: { count: 0, total: 0 },
        watch: { count: 0, total: 0 },
      };

      (data || []).forEach((p) => {
        const score = p.snap_score ?? 0;
        if (score >= 70) {
          funnel.distressed.count++;
          funnel.distressed.total += score;
        } else if (score >= 40) {
          funnel.value_add.count++;
          funnel.value_add.total += score;
        } else {
          funnel.watch.count++;
          funnel.watch.total += score;
        }
      });

      return [
        {
          opportunity_class: "distressed",
          property_count: funnel.distressed.count,
          avg_score: funnel.distressed.count > 0 
            ? Math.round(funnel.distressed.total / funnel.distressed.count) 
            : 0,
        },
        {
          opportunity_class: "value_add",
          property_count: funnel.value_add.count,
          avg_score: funnel.value_add.count > 0 
            ? Math.round(funnel.value_add.total / funnel.value_add.count) 
            : 0,
        },
        {
          opportunity_class: "watch",
          property_count: funnel.watch.count,
          avg_score: funnel.watch.count > 0 
            ? Math.round(funnel.watch.total / funnel.watch.count) 
            : 0,
        },
      ] as OpportunityFunnel[];
    },
  });
}

// Fetch hot properties (top distressed)
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
  });
}

// Fetch jurisdiction statistics
export function useJurisdictionStats() {
  return useQuery({
    queryKey: ["jurisdiction-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jurisdictions")
        .select(`
          id,
          name,
          city,
          state,
          enforcement_profile
        `);

      if (error) throw error;

      // Get property counts per jurisdiction
      const { data: properties } = await supabase
        .from("properties")
        .select("jurisdiction_id, snap_score");

      // Aggregate stats
      const statsMap = new Map<string, JurisdictionStats>();

      (data || []).forEach((j) => {
        statsMap.set(j.id, {
          jurisdiction_id: j.id,
          jurisdiction_name: j.name,
          city: j.city,
          state: j.state,
          enforcement_profile: (j.enforcement_profile as any) || {
            strictness: "unknown",
            avg_violations_per_property: 0,
            score_multiplier: 1.0,
          },
          property_count: 0,
          avg_score: 0,
          distressed_count: 0,
        });
      });

      // Count properties per jurisdiction
      const jurisdictionCounts = new Map<string, { count: number; total: number; distressed: number }>();
      
      (properties || []).forEach((p) => {
        if (!p.jurisdiction_id) return;
        const existing = jurisdictionCounts.get(p.jurisdiction_id) || { count: 0, total: 0, distressed: 0 };
        existing.count++;
        existing.total += p.snap_score ?? 0;
        if ((p.snap_score ?? 0) >= 70) existing.distressed++;
        jurisdictionCounts.set(p.jurisdiction_id, existing);
      });

      // Merge counts into stats
      jurisdictionCounts.forEach((counts, jId) => {
        const stat = statsMap.get(jId);
        if (stat) {
          stat.property_count = counts.count;
          stat.avg_score = counts.count > 0 ? Math.round(counts.total / counts.count) : 0;
          stat.distressed_count = counts.distressed;
        }
      });

      return Array.from(statsMap.values())
        .filter((s) => s.property_count > 0)
        .sort((a, b) => b.property_count - a.property_count);
    },
  });
}
