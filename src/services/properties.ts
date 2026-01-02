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
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Debug logging
  console.log("[fetchPropertiesPaged] Filters received:", JSON.stringify(filters, null, 2));

  // Base query
  let q = filters.listId
    ? supabase
        .from("properties")
        .select("*, list_properties!inner(list_id)", { count: "exact" })
        .eq("list_properties.list_id", filters.listId)
    : supabase.from("properties").select("*", { count: "exact" });

  // Filter: state (case-insensitive)
  if (filters.state) {
    console.log("[fetchPropertiesPaged] Applying state filter:", filters.state);
    q = q.ilike("state", filters.state);
  }

  // Filter: county
  if (filters.county) {
    console.log("[fetchPropertiesPaged] Applying county filter:", filters.county);
    q = q.ilike("county", `%${filters.county}%`);
  }

  // Filter: jurisdiction (could be UUID or city|state format)
  if (filters.jurisdictionId) {
    console.log("[fetchPropertiesPaged] Applying jurisdiction filter:", filters.jurisdictionId);
    // Check if it's a city|state format
    if (filters.jurisdictionId.includes('|')) {
      const [city, state] = filters.jurisdictionId.split('|');
      q = q.ilike("city", city).ilike("state", state);
    } else {
      q = q.eq("jurisdiction_id", filters.jurisdictionId);
    }
  }

  // Filter: cities (CRITICAL FIX: case-insensitive to handle Tampa vs TAMPA vs tampa)
  if (filters.cities?.length) {
    console.log("[fetchPropertiesPaged] Applying cities filter:", filters.cities);
    if (filters.cities.length === 1) {
      // Single city - use case-insensitive match (fixes Tampa vs TAMPA bug)
      q = q.ilike("city", filters.cities[0]);
    } else {
      // Multiple cities - use OR with case-insensitive matches
      const orFilters = filters.cities.map(city => `city.ilike.${city}`).join(',');
      q = q.or(orFilters);
    }
  }

  // Filter: search across multiple columns (address, city, state, county, zip)
  if (filters.search) {
    let s = filters.search.trim();
    console.log("[fetchPropertiesPaged] Applying search filter:", s);

    // Expand common city abbreviations for better matching
    const abbreviations: Record<string, string> = {
      'ft': 'fort',
      'st': 'saint',
      'mt': 'mount',
      'pt': 'port',
      'n': 'north',
      's': 'south',
      'e': 'east',
      'w': 'west',
    };

    // Check if search starts with a known abbreviation
    const firstWord = s.split(/\s+/)[0].toLowerCase();
    const expansion = abbreviations[firstWord];

    if (expansion) {
      // Search for both the abbreviation and the expanded form
      const expandedSearch = s.replace(new RegExp(`^${firstWord}`, 'i'), expansion);
      console.log("[fetchPropertiesPaged] Expanded search:", expandedSearch);

      // Search with both original and expanded terms
      q = q.or(
        `address.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%,county.ilike.%${s}%,zip.ilike.%${s}%,` +
        `address.ilike.%${expandedSearch}%,city.ilike.%${expandedSearch}%,county.ilike.%${expandedSearch}%`
      );
    } else {
      // Standard search
      q = q.or(`address.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%,county.ilike.%${s}%,zip.ilike.%${s}%`);
    }
  }

  // Filter: snap score
  if (filters.snapScoreRange) {
    const [min, max] = filters.snapScoreRange;
    console.log("[fetchPropertiesPaged] Applying snap_score filter:", min, "-", max);
    q = q.gte("snap_score", min).lte("snap_score", max);
  }

  // Filter: last seen (updated_at within X days)
  if (filters.lastSeenDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.lastSeenDays);
    const cutoffIso = cutoffDate.toISOString();
    console.log("[fetchPropertiesPaged] Applying lastSeenDays filter:", filters.lastSeenDays, "days, cutoff:", cutoffIso);
    q = q.gte("updated_at", cutoffIso);
  }

  // Filter: violation type (using the violation_types array on properties)
  if (filters.violationType) {
    console.log("[fetchPropertiesPaged] Applying violationType filter:", filters.violationType);
    q = q.contains("violation_types", [filters.violationType]);
  }

  // Sort by snap_score desc (as your UI shows)
  q = q.order("snap_score", { ascending: false, nullsFirst: false }).range(from, to);

  console.log("[fetchPropertiesPaged] Executing query...");
  const { data, error, count } = await q;
  
  if (error) {
    console.error("[fetchPropertiesPaged] Query error:", error);
    throw error;
  }
  
  console.log("[fetchPropertiesPaged] Results:", data?.length, "properties, total:", count);
  return { data: data ?? [], total: count ?? 0 };
}
