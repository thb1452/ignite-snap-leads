import { supabase } from "@/integrations/supabase/client";
import type { LeadFilters } from "@/schemas";

export interface BBoxFilters {
  bbox?: [number, number, number, number]; // [west, south, east, north]
  scoreGte?: number;
  lastSeenLte?: number; // days
  source?: string;
}

export async function fetchPropertiesByBBox(
  bbox: [number, number, number, number],
  filters: BBoxFilters = {},
  page: number = 1,
  pageSize: number = 50
) {
  const { data, error } = await supabase.rpc("fn_properties_by_bbox", {
    p_west: bbox[0],
    p_south: bbox[1],
    p_east: bbox[2],
    p_north: bbox[3],
    p_score_gte: filters.scoreGte ?? null,
    p_last_seen_lte: filters.lastSeenLte ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw error;
  
  const result = data as any; // PostGIS function returns jsonb
  return {
    items: result?.items ?? [],
    total: result?.total ?? 0,
    bbox: result?.bbox ?? bbox,
  };
}

export async function fetchPropertiesPaged(
  page: number,
  pageSize: number,
  filters: LeadFilters
) {
  console.log("[fetchPropertiesPaged] Filters received:", JSON.stringify(filters, null, 2));

  // For list filtering, we still need to use the old query pattern
  if (filters.listId) {
    return fetchPropertiesPagedLegacy(page, pageSize, filters);
  }

  // Use the optimized RPC function for fast queries
  const { data, error } = await supabase.rpc("fn_properties_paged", {
    p_page: page,
    p_page_size: pageSize,
    p_state: filters.state || null,
    p_city: filters.cities?.length === 1 ? filters.cities[0] : null,
    p_search: filters.search || null,
    p_snap_min: filters.snapScoreRange?.[0] ?? null,
    p_snap_max: filters.snapScoreRange?.[1] ?? null,
  });

  if (error) {
    console.error("[fetchPropertiesPaged] RPC error:", error);
    throw error;
  }

  const result = data as { data: any[]; total: number; page: number; pageSize: number };
  console.log("[fetchPropertiesPaged] Results:", result.data?.length, "properties, total:", result.total);
  
  return { data: result.data ?? [], total: result.total ?? 0 };
}

// Legacy function for complex filters (list filtering, multi-city, etc.)
async function fetchPropertiesPagedLegacy(
  page: number,
  pageSize: number,
  filters: LeadFilters
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Base query - use estimated count for performance
  let q = filters.listId
    ? supabase
        .from("properties")
        .select("*, list_properties!inner(list_id)", { count: "estimated" })
        .eq("list_properties.list_id", filters.listId)
    : supabase.from("properties").select("*", { count: "estimated" });

  // Filter: state (case-insensitive)
  if (filters.state) {
    q = q.ilike("state", filters.state);
  }

  // Filter: county
  if (filters.county) {
    q = q.ilike("county", `%${filters.county}%`);
  }

  // Filter: jurisdiction (could be UUID or city|state format)
  if (filters.jurisdictionId) {
    if (filters.jurisdictionId.includes('|')) {
      const [city, state] = filters.jurisdictionId.split('|');
      q = q.ilike("city", city).ilike("state", state);
    } else {
      q = q.eq("jurisdiction_id", filters.jurisdictionId);
    }
  }

  // Filter: cities
  if (filters.cities?.length) {
    if (filters.cities.length === 1) {
      q = q.ilike("city", filters.cities[0]);
    } else {
      const orFilters = filters.cities.map(city => `city.ilike.${city}`).join(',');
      q = q.or(orFilters);
    }
  }

  // Filter: search across multiple columns
  if (filters.search) {
    const s = filters.search.trim();
    q = q.or(`address.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%,county.ilike.%${s}%,zip.ilike.%${s}%`);
  }

  // Filter: snap score
  if (filters.snapScoreRange) {
    const [min, max] = filters.snapScoreRange;
    q = q.gte("snap_score", min).lte("snap_score", max);
  }

  // Filter: last seen (updated_at within X days)
  if (filters.lastSeenDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.lastSeenDays);
    q = q.gte("updated_at", cutoffDate.toISOString());
  }

  // Filter: violation type
  if (filters.violationType) {
    q = q.contains("violation_types", [filters.violationType]);
  }

  // Pressure level filters
  if (filters.openViolationsOnly) {
    console.log("[fetchPropertiesPaged] Applying openViolationsOnly filter");
    q = q.gt("open_violations", 0);
  }

  if (filters.multipleViolationsOnly) {
    console.log("[fetchPropertiesPaged] Applying multipleViolationsOnly filter");
    q = q.gt("total_violations", 1);
  }

  if (filters.repeatOffenderOnly) {
    console.log("[fetchPropertiesPaged] Applying repeatOffenderOnly filter");
    q = q.eq("repeat_offender", true);
  }

  // Sort and paginate
  q = q.order("snap_score", { ascending: false, nullsFirst: false }).range(from, to);

  const { data, error, count } = await q;
  
  if (error) {
    console.error("[fetchPropertiesPagedLegacy] Query error:", error);
    throw error;
  }
  
  return { data: data ?? [], total: count ?? 0 };
}
