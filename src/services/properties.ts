import { supabase } from "@/integrations/supabase/externalClient";
import type { LeadFilters } from "@/schemas";
import { getRandomSeed } from "@/lib/randomSeed";

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
  // Validate inputs
  if (page < 1) {
    console.warn("[fetchPropertiesPaged] Invalid page number, using 1");
    page = 1;
  }
  if (pageSize < 1 || pageSize > 1000) {
    console.warn("[fetchPropertiesPaged] Invalid pageSize, using 50");
    pageSize = 50;
  }

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
  // Defensive checks: ensure all values are properly typed
  const { data, error } = await supabase.rpc("fn_properties_paged", {
    p_page: page,
    p_page_size: pageSize,
    p_state: filters.state && typeof filters.state === 'string' ? filters.state : null,
    p_city: filters.cities && Array.isArray(filters.cities) && filters.cities.length === 1 && typeof filters.cities[0] === 'string' 
      ? filters.cities[0] 
      : null,
    p_search: filters.search && typeof filters.search === 'string' ? filters.search.trim() : null,
    p_snap_min: filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[0] === 'number'
      ? filters.snapScoreRange[0]
      : null,
    p_snap_max: filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[1] === 'number'
      ? filters.snapScoreRange[1]
      : null,
    p_last_seen_days: filters.lastSeenDays !== undefined && filters.lastSeenDays !== null && typeof filters.lastSeenDays === 'number' && filters.lastSeenDays > 0
      ? filters.lastSeenDays
      : null,
    p_sort_by: filters.sortBy && ['snap_score', 'newest_violation', 'recently_updated'].includes(filters.sortBy)
      ? filters.sortBy
      : 'snap_score',
    p_open_violations_only: filters.openViolationsOnly === true,
    p_multiple_violations_only: filters.multipleViolationsOnly === true,
    p_repeat_offender_only: filters.repeatOffenderOnly === true,
    p_random_seed: getRandomSeed(),
  });

  if (error) {
    console.error("[fetchPropertiesPaged] RPC error:", error);
    throw new Error(`Failed to fetch properties: ${error.message}`);
  }

  // RPC returns { items, total, page, page_size, data_tier } - NOT { data }
  const result = data as { items: any[]; total: number; page: number; page_size: number; has_subscription?: boolean; data_tier?: string };
  
  // Defensive checks for result
  if (!result) {
    console.warn("[fetchPropertiesPaged] RPC returned null/undefined, using empty result");
    return { data: [], total: 0, dataTier: null };
  }
  
  console.log("[fetchPropertiesPaged] Results:", result.items?.length ?? 0, "properties, total:", result.total ?? 0, "has_subscription:", result.has_subscription, "data_tier:", result.data_tier);
  
  return { 
    data: Array.isArray(result.items) ? result.items : [], 
    total: typeof result.total === 'number' ? result.total : 0, 
    dataTier: result.data_tier ?? null 
  };
}

// Use the category RPC for violation type filtering
async function fetchPropertiesByCategory(
  page: number,
  pageSize: number,
  filters: LeadFilters
) {
  // Validate violationType exists
  if (!filters.violationType || typeof filters.violationType !== 'string') {
    throw new Error("violationType is required for category filtering");
  }

  // Validate inputs
  if (page < 1) page = 1;
  if (pageSize < 1 || pageSize > 1000) pageSize = 50;

  const { data, error } = await supabase.rpc("fn_properties_by_category", {
    p_category: filters.violationType,
    p_state: filters.state && typeof filters.state === 'string' ? filters.state : null,
    p_city: filters.cities && Array.isArray(filters.cities) && filters.cities.length === 1 && typeof filters.cities[0] === 'string'
      ? filters.cities[0]
      : null,
    p_search: filters.search && typeof filters.search === 'string' ? filters.search.trim() : null,
    p_snap_min: filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[0] === 'number'
      ? filters.snapScoreRange[0]
      : null,
    p_snap_max: filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[1] === 'number'
      ? filters.snapScoreRange[1]
      : null,
    p_last_seen_days: filters.lastSeenDays !== undefined && filters.lastSeenDays !== null && typeof filters.lastSeenDays === 'number' && filters.lastSeenDays > 0
      ? filters.lastSeenDays
      : null,
    p_page: page,
    p_page_size: pageSize,
    p_sort_by: filters.sortBy && ['snap_score', 'newest_violation', 'recently_updated'].includes(filters.sortBy)
      ? filters.sortBy
      : 'snap_score',
    p_open_violations_only: filters.openViolationsOnly === true,
    p_multiple_violations_only: filters.multipleViolationsOnly === true,
    p_repeat_offender_only: filters.repeatOffenderOnly === true,
    p_random_seed: getRandomSeed(),
  });

  if (error) {
    console.error("[fetchPropertiesByCategory] RPC error:", error);
    throw new Error(`Failed to fetch properties by category: ${error.message}`);
  }

  const result = data as { items: any[]; total: number; page: number; page_size: number };
  
  // Defensive checks
  if (!result) {
    console.warn("[fetchPropertiesByCategory] RPC returned null/undefined, using empty result");
    return { data: [], total: 0, dataTier: null };
  }
  
  console.log("[fetchPropertiesByCategory] Results:", result.items?.length ?? 0, "properties, total:", result.total ?? 0);
  
  return { 
    data: Array.isArray(result.items) ? result.items : [], 
    total: typeof result.total === 'number' ? result.total : 0, 
    dataTier: null as string | null 
  };
}

// Legacy function for complex filters (list filtering, multi-city, etc.)
async function fetchPropertiesPagedLegacy(
  page: number,
  pageSize: number,
  filters: LeadFilters
) {
  // Validate inputs
  if (page < 1) {
    console.warn("[fetchPropertiesPagedLegacy] Invalid page number, using 1");
    page = 1;
  }
  if (pageSize < 1 || pageSize > 1000) {
    console.warn("[fetchPropertiesPagedLegacy] Invalid pageSize, using 50");
    pageSize = 50;
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Base query - use estimated count for performance
  let q = filters.listId && typeof filters.listId === 'string'
    ? supabase
        .from("properties")
        .select("*, list_properties!inner(list_id)", { count: "estimated" })
        .eq("list_properties.list_id", filters.listId)
    : supabase.from("properties").select("*", { count: "estimated" });

  // Filter: state (case-insensitive) - defensive check
  if (filters.state && typeof filters.state === 'string') {
    q = q.ilike("state", filters.state);
  }

  // Filter: county - defensive check
  if (filters.county && typeof filters.county === 'string') {
    q = q.ilike("county", `%${filters.county}%`);
  }

  // Filter: jurisdiction (could be UUID or city|state format) - defensive check
  if (filters.jurisdictionId && typeof filters.jurisdictionId === 'string') {
    if (filters.jurisdictionId.includes('|')) {
      const parts = filters.jurisdictionId.split('|');
      if (parts.length === 2) {
        const [city, state] = parts;
        if (city && state) {
          q = q.ilike("city", city).ilike("state", state);
        }
      }
    } else {
      q = q.eq("jurisdiction_id", filters.jurisdictionId);
    }
  }

  // Filter: cities - defensive check
  if (filters.cities && Array.isArray(filters.cities) && filters.cities.length > 0) {
    const validCities = filters.cities.filter(c => typeof c === 'string' && c.trim() !== '');
    if (validCities.length === 1) {
      q = q.ilike("city", validCities[0]);
    } else if (validCities.length > 1) {
      const orFilters = validCities.map(city => `city.ilike.${city}`).join(',');
      q = q.or(orFilters);
    }
  }

  // Filter: search across multiple columns - defensive check
  if (filters.search && typeof filters.search === 'string') {
    const s = filters.search.trim();
    if (s) {
      // Escape special characters for PostgREST
      const escaped = s.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.or(`address.ilike.%${escaped}%,city.ilike.%${escaped}%,state.ilike.%${escaped}%,county.ilike.%${escaped}%,zip.ilike.%${escaped}%`);
    }
  }

  // Filter: snap score - defensive check
  if (filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && filters.snapScoreRange.length === 2) {
    const [min, max] = filters.snapScoreRange;
    if (typeof min === 'number' && typeof max === 'number' && min >= 0 && max <= 100 && min <= max) {
      q = q.gte("snap_score", min).lte("snap_score", max);
    }
  }

  // Filter: last seen (updated_at within X days) - defensive check
  if (filters.lastSeenDays !== undefined && filters.lastSeenDays !== null && typeof filters.lastSeenDays === 'number' && filters.lastSeenDays > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.lastSeenDays);
    q = q.gte("updated_at", cutoffDate.toISOString());
  }

  // Note: violationType filtering is now handled by fetchPropertiesByCategory RPC
  // This legacy path is only used for listId, pressure level filters

  // Pressure level filters - defensive checks
  if (filters.openViolationsOnly === true) {
    if (import.meta.env.DEV) {
      console.log("[fetchPropertiesPagedLegacy] Applying openViolationsOnly filter");
    }
    q = q.gt("open_violations", 0);
  }

  if (filters.multipleViolationsOnly === true) {
    if (import.meta.env.DEV) {
      console.log("[fetchPropertiesPagedLegacy] Applying multipleViolationsOnly filter");
    }
    q = q.gt("total_violations", 1);
  }

  if (filters.repeatOffenderOnly === true) {
    if (import.meta.env.DEV) {
      console.log("[fetchPropertiesPagedLegacy] Applying repeatOffenderOnly filter");
    }
    q = q.eq("repeat_offender", true);
  }

  // Sort based on sortBy filter - defensive check
  const sortBy = filters.sortBy && ['snap_score', 'newest_violation', 'recently_updated'].includes(filters.sortBy)
    ? filters.sortBy
    : 'recently_updated';

  if (sortBy === 'snap_score') {
    q = q.order("snap_score", { ascending: false, nullsFirst: false })
         .order("total_violations", { ascending: false, nullsFirst: false });
  } else if (sortBy === 'newest_violation') {
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
    throw new Error(`Failed to fetch properties: ${error.message}`);
  }
  
  // Defensive checks for result
  const resultData = Array.isArray(data) ? data : [];
  const resultCount = typeof count === 'number' ? count : 0;
  
  // Legacy path doesn't have dataTier from RPC, so we set it as null
  // In practice, legacy is only used for advanced filters by Pro+ users
  return { 
    data: resultData, 
    total: resultCount, 
    dataTier: null as string | null 
  };
}
