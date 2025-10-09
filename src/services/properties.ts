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

  // Base query
  let q = filters.listId
    ? supabase
        .from("properties")
        .select("*, list_properties!inner(list_id)", { count: "exact" })
        .eq("list_properties.list_id", filters.listId)
    : supabase.from("properties").select("*", { count: "exact" });

  // Filter: cities
  if (filters.cities?.length) q = q.in("city", filters.cities);

  // Filter: search (server-side best effort)
  if (filters.search) {
    const s = filters.search.trim();
    // You can add a text index and use ilike for simple cases
    q = q.or(`address.ilike.%${s}%,city.ilike.%${s}%,zip.ilike.%${s}%`);
  }

  // Filter: snap score
  if (filters.snapScoreRange) {
    const [min, max] = filters.snapScoreRange;
    q = q.gte("snap_score", min).lte("snap_score", max);
  }

  // Sort by snap_score desc (as your UI shows)
  q = q.order("snap_score", { ascending: false, nullsFirst: false }).range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0 };
}
