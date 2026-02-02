import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeadFilters } from "@/schemas";
import { getCategoryById } from "@/utils/violationCategoryMapper";

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  snap_score: number | null;
  address: string;
  city: string;
  state: string;
  enforcement_type?: string; // 'code_violation' or 'water_shutoff'
}

// Map clusters handle high-density areas efficiently
const MAX_MARKERS = 10000;

// Clean filter object by removing undefined/null values
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

// Check if filters require advanced query (same logic as properties.ts needsLegacyPath)
function hasAdvancedFilters(filters: LeadFilters): boolean {
  return !!(
    filters.violationType ||
    filters.openViolationsOnly ||
    filters.multipleViolationsOnly ||
    filters.repeatOffenderOnly ||
    filters.lastSeenDays
  );
}

// Fetch markers directly from properties table with full filter support.
// Used when advanced filters are active that fn_map_markers doesn't support.
async function fetchMarkersDirectQuery(filters: LeadFilters): Promise<MapMarker[]> {
  console.log("[useMapMarkers] Using direct query for advanced filters");

  let q = supabase
    .from("properties")
    .select("id, latitude, longitude, snap_score, address, city, state, enforcement_type")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  // State filter
  if (filters.state) {
    q = q.ilike("state", filters.state);
  }

  // City filter
  if (filters.cities?.length === 1) {
    q = q.ilike("city", filters.cities[0]);
  }

  // Search filter
  if (filters.search) {
    const s = filters.search.trim();
    q = q.or(`address.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%,zip.ilike.%${s}%`);
  }

  // Snap score filter
  if (filters.snapScoreRange) {
    const [min, max] = filters.snapScoreRange;
    q = q.gte("snap_score", min).lte("snap_score", max);
  }

  // Last seen days filter
  if (filters.lastSeenDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - filters.lastSeenDays);
    q = q.gte("updated_at", cutoffDate.toISOString());
  }

  // Violation type (category) filter - same logic as legacy path in properties.ts
  if (filters.violationType) {
    const category = getCategoryById(filters.violationType);
    if (category) {
      const keywordsToMatch = category.keywords
        .filter(kw => !kw.match(/^\d/))
        .slice(0, 8);
      const orConditions = keywordsToMatch
        .map(kw => `violation_types::text.ilike.%${kw}%`)
        .join(',');
      q = q.or(orConditions);
    } else {
      q = q.or(`violation_types::text.ilike.%${filters.violationType}%`);
    }
  }

  // Pressure level filters
  if (filters.openViolationsOnly) {
    q = q.gt("open_violations", 0);
  }
  if (filters.multipleViolationsOnly) {
    q = q.gt("total_violations", 1);
  }
  if (filters.repeatOffenderOnly) {
    q = q.eq("repeat_offender", true);
  }

  // Order by score and limit
  q = q.order("snap_score", { ascending: false, nullsFirst: false }).limit(MAX_MARKERS);

  const { data, error } = await q;

  if (error) {
    console.error("[useMapMarkers] Direct query error:", error);
    throw error;
  }

  const markers = (data ?? []) as MapMarker[];
  console.log("[useMapMarkers] Direct query returned", markers.length, "markers");
  return markers;
}

// Fetch markers via RPC (basic filters only: state, city, search, snap score)
async function fetchMarkersRPC(filters: LeadFilters): Promise<MapMarker[]> {
  const { data, error } = await supabase.rpc("fn_map_markers", {
    p_state: filters.state || null,
    p_city: filters.cities?.length === 1 ? filters.cities[0] : null,
    p_search: filters.search || null,
    p_snap_min: filters.snapScoreRange?.[0] ?? null,
    p_snap_max: filters.snapScoreRange?.[1] ?? null,
    p_limit: MAX_MARKERS,
  });

  if (error) {
    console.error("[useMapMarkers] RPC error:", error);
    throw error;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = data as unknown as { items: MapMarker[] | null; total: number; error?: string };

  if (result.error) {
    console.warn("[useMapMarkers] RPC returned error:", result.error);
    return [];
  }

  if (!result.items) {
    console.warn("[useMapMarkers] RPC returned null items");
    return [];
  }

  let markers = result.items ?? [];

  // Client-side safety filter for state/city
  if (filters.state) {
    const stateUpper = filters.state.toUpperCase();
    const before = markers.length;
    markers = markers.filter(m => m.state && m.state.toUpperCase() === stateUpper);
    if (markers.length !== before) {
      console.warn(`[useMapMarkers] Client-side state filter removed ${before - markers.length} markers not matching state=${filters.state}`);
    }
  }

  if (filters.cities?.length === 1) {
    const cityLower = filters.cities[0].toLowerCase();
    markers = markers.filter(m => m.city && m.city.toLowerCase() === cityLower);
  }

  console.log("[useMapMarkers] RPC returned", markers.length, "markers");
  return markers;
}

async function fetchFilteredMarkers(rawFilters: LeadFilters): Promise<MapMarker[]> {
  const filters = cleanFilters(rawFilters);
  console.log("[useMapMarkers] Fetching markers with filters:", JSON.stringify(filters));

  // When advanced filters are active (violationType, pressure level, lastSeenDays),
  // query the properties table directly instead of using fn_map_markers RPC
  // which only supports basic filters (state, city, search, snap score).
  if (hasAdvancedFilters(filters)) {
    return fetchMarkersDirectQuery(filters);
  }

  return fetchMarkersRPC(filters);
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
