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
  pageSize: number = 100
) {
  // For now, use client-side bbox filtering until we create the DB function
  let query = supabase
    .from("properties")
    .select("*")
    .gte("latitude", bbox[1])
    .lte("latitude", bbox[3])
    .gte("longitude", bbox[0])
    .lte("longitude", bbox[2]);

  if (filters.scoreGte) {
    query = query.gte("snap_score", filters.scoreGte);
  }

  query = query
    .order("snap_score", { ascending: false, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
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
