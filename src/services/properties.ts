import { supabase } from "@/integrations/supabase/externalClient";
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
  
  type BBoxResult = {
    items?: unknown[];
    total?: number;
    bbox?: [number, number, number, number];
  };

  const result = data as BBoxResult | null; // PostGIS function returns jsonb
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

  // Use RPC for category filtering (handles text search in violation_types array)
  // Now also supports pressure level filters
  if (filters.violationType) {
    console.log("[fetchPropertiesPaged] Using category RPC for:", filters.violationType);
    return fetchPropertiesByCategory(page, pageSize, filters);
  }

  // Use legacy path ONLY for list filtering (which needs JOIN)
  if (filters.listId) {
    console.log("[fetchPropertiesPaged] Using legacy path for list filter");
    return fetchPropertiesPagedLegacy(page, pageSize, filters);
  }

  // Use the optimized RPC function for all queries including pressure level filters
  const { data, error } = await supabase.rpc("fn_properties_paged", {
    p_page: page,
    p_page_size: pageSize,
    p_state: filters.state || null,
    p_city: filters.cities?.length === 1 ? filters.cities[0] : null,
    p_search: filters.search || null,
    p_snap_min: filters.snapScoreRange?.[0] ?? null,
    p_snap_max: filters.snapScoreRange?.[1] ?? null,
    p_last_seen_days: filters.lastSeenDays ?? null,
    p_sort_by: filters.sortBy || 'snap_score',
    p_open_violations_only: filters.openViolationsOnly ?? false,
    p_multiple_violations_only: filters.multipleViolationsOnly ?? false,
    p_repeat_offender_only: filters.repeatOffenderOnly ?? false,
  });

  if (error) {
    console.error("[fetchPropertiesPaged] RPC error:", error);
    throw error;
  }

  // RPC returns { items, total, page, page_size, data_tier } - NOT { data }
  const result = data as { items: any[]; total: number; page: number; page_size: number; has_subscription?: boolean; data_tier?: string };
  console.log("[fetchPropertiesPaged] Results:", result.items?.length, "properties, total:", result.total, "has_subscription:", result.has_subscription, "data_tier:", result.data_tier);
  
  return { data: result.items ?? [], total: result.total ?? 0, dataTier: result.data_tier ?? null };
}

// Use the category RPC for violation type filtering
async function fetchPropertiesByCategory(
  page: number,
  pageSize: number,
  filters: LeadFilters
) {
  const { data, error } = await supabase.rpc("fn_properties_by_category", {
    p_category: filters.violationType!,
    p_state: filters.state || null,
    p_city: filters.cities?.length === 1 ? filters.cities[0] : null,
    p_search: filters.search || null,
    p_snap_min: filters.snapScoreRange?.[0] ?? null,
    p_snap_max: filters.snapScoreRange?.[1] ?? null,
    p_last_seen_days: filters.lastSeenDays ?? null,
    p_page: page,
    p_page_size: pageSize,
    p_sort_by: filters.sortBy || 'snap_score',
    p_open_violations_only: filters.openViolationsOnly ?? false,
    p_multiple_violations_only: filters.multipleViolationsOnly ?? false,
    p_repeat_offender_only: filters.repeatOffenderOnly ?? false,
  });

  if (error) {
    console.error("[fetchPropertiesByCategory] RPC error:", error);
    throw error;
  }

  const result = data as { items: any[]; total: number; page: number; page_size: number };
  console.log("[fetchPropertiesByCategory] Results:", result.items?.length, "properties, total:", result.total);
  
  return { data: result.items ?? [], total: result.total ?? 0, dataTier: null as string | null };
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

  // Note: violationType filtering is now handled by fetchPropertiesByCategory RPC
  // This legacy path is only used for listId, pressure level filters

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

  // Sort based on sortBy filter
  if (filters.sortBy === 'snap_score') {
    q = q.order("snap_score", { ascending: false, nullsFirst: false })
         .order("total_violations", { ascending: false, nullsFirst: false });
  } else if (filters.sortBy === 'newest_violation') {
    q = q.order("newest_violation_date", { ascending: false, nullsFirst: false })
         .order("total_violations", { ascending: false, nullsFirst: false });
  } else {
    // Default: recently_updated
    q = q.order("updated_at", { ascending: false, nullsFirst: false });
  }

  // Paginate
  q = q.range(from, to);

  const { data, error, count } = await q;
  
  if (error) {
    console.error("[fetchPropertiesPagedLegacy] Query error:", error);
    throw error;
  }
  
  // Legacy path doesn't have dataTier from RPC, so we set it as null
  // In practice, legacy is only used for advanced filters by Pro+ users
  return { data: data ?? [], total: count ?? 0, dataTier: null as string | null };
}
