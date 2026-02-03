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
  enforcement_type?: string;
}

const MAX_MARKERS = 50000; // Increased from 10k - clustering handles this efficiently

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

// Query properties table directly with full filter support.
// This replaces the fn_map_markers RPC which had unreliable state filtering
// and didn't support advanced filters (violation type, pressure level, etc).
async function fetchMarkers(filters: LeadFilters): Promise<MapMarker[]> {
  let q = supabase
    .from("properties")
    .select("id, latitude, longitude, snap_score, address, city, state, enforcement_type")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .neq("latitude", 0)  // Exclude 0,0 coords (geocoding failures)
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
  return fetchMarkers(filters);
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
