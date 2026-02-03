import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeadFilters } from "@/schemas";

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  snap_score: number | null;
  address: string;
  city: string;
  state: string;
  enforcement_type?: string;
}

const MAX_MARKERS = 10000;

function cleanFilters(filters: LeadFilters): LeadFilters {
  if (!filters || typeof filters !== 'object') return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    cleaned[key] = value;
  }
  return cleaned as LeadFilters;
}

// Use RPC for category filtering since PostgREST doesn't support text search on arrays
async function fetchMarkersWithCategory(filters: LeadFilters): Promise<MapMarker[]> {
  console.log("[useMapMarkers] Using RPC for category:", filters.violationType);
  
  const { data, error } = await supabase.rpc("fn_map_markers_by_category", {
    p_category: filters.violationType!,
    p_state: filters.state || null,
    p_city: filters.cities?.length === 1 ? filters.cities[0] : null,
    p_snap_min: filters.snapScoreRange?.[0] ?? null,
    p_snap_max: filters.snapScoreRange?.[1] ?? null,
    p_limit: MAX_MARKERS,
  });
  
  if (error) {
    console.error("[useMapMarkers] RPC error:", error);
    throw error;
  }
  
  return (data ?? []) as MapMarker[];
}

// Query properties table directly for non-category filters
async function fetchMarkersDirectly(filters: LeadFilters): Promise<MapMarker[]> {
  let q = supabase
    .from("properties")
    .select("id, latitude, longitude, snap_score, address, city, state, enforcement_type")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .neq("latitude", 0)
    .neq("longitude", 0);

  if (filters.state) {
    q = q.ilike("state", filters.state);
  }
  if (filters.cities?.length === 1) {
    q = q.ilike("city", filters.cities[0]);
  }
  if (filters.search) {
    const s = filters.search.trim();
    q = q.or(`address.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%,zip.ilike.%${s}%`);
  }
  if (filters.snapScoreRange) {
    const [min, max] = filters.snapScoreRange;
    q = q.gte("snap_score", min).lte("snap_score", max);
  }
  if (filters.lastSeenDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.lastSeenDays);
    q = q.gte("updated_at", cutoffDate.toISOString());
  }
  if (filters.openViolationsOnly) {
    q = q.gt("open_violations", 0);
  }
  if (filters.multipleViolationsOnly) {
    q = q.gt("total_violations", 1);
  }
  if (filters.repeatOffenderOnly) {
    q = q.eq("repeat_offender", true);
  }

  q = q.order("snap_score", { ascending: false, nullsFirst: false }).limit(MAX_MARKERS);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MapMarker[];
}

async function fetchFilteredMarkers(rawFilters: LeadFilters): Promise<MapMarker[]> {
  const filters = cleanFilters(rawFilters);
  console.log("[useMapMarkers] Fetching markers with filters:", JSON.stringify(filters));
  
  // Use RPC for category filtering (handles text search in violation_types array)
  if (filters.violationType) {
    return fetchMarkersWithCategory(filters);
  }
  
  // Use direct query for other filters
  return fetchMarkersDirectly(filters);
}

export function useMapMarkers(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: ["map-markers", filters],
    queryFn: () => fetchFilteredMarkers(filters),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });
}
