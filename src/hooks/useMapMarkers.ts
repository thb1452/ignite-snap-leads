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
    // The filter passes category IDs like "exterior", "safety", "structural", "maintenance"
    // Properties have violation_types array with BOTH clean categories ("Exterior") AND raw IPMC codes
    // We need to check for both exact array contains AND text search in the array
    const categoryKeywordMap: Record<string, string[]> = {
      exterior: ['Exterior'],
      structural: ['Structural'],
      safety: ['Safety', 'Fire'],
      zoning: ['Zoning'],
      maintenance: ['Rubbish', 'Grass', 'Trash', 'Debris', 'Weed', 'Dumping', 'Waste', 'Snow'],
      interior: ['Interior', 'Plumbing', 'HVAC', 'Furnace', '305.3', '305.6', '605.3'],
      vacancy: ['Vacancy', 'Vacant'],
      other: ['Unknown', 'Other', 'Complaint'],
    };
    
    const keywords = categoryKeywordMap[filters.violationType] || [
      filters.violationType.charAt(0).toUpperCase() + filters.violationType.slice(1)
    ];
    
    console.log("[useMapMarkers] Filtering by category:", filters.violationType, "-> keywords:", keywords);
    
    // Build OR conditions that check if any keyword appears in the array (either as exact value or within text)
    // Use ilike on the text representation of the array for broader matching
    const orConditions = keywords.map(kw => `violation_types::text.ilike.%${kw}%`).join(',');
    q = q.or(orConditions);
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
