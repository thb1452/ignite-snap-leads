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
  enforcement_type?: string; // 'code_violation' or 'water_shutoff'
}

// Reduced from 50k to prevent timeout with large datasets
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

async function fetchFilteredMarkers(rawFilters: LeadFilters): Promise<MapMarker[]> {
  const filters = cleanFilters(rawFilters);
  console.log("[useMapMarkers] Fetching markers with filters:", JSON.stringify(filters));

  // Use the new RPC function that respects user_allowed_states
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

  // RPC returns { items: [], total: number }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = data as unknown as { items: MapMarker[] | null; total: number; error?: string };
  
  if (result.error) {
    // Don't throw for expected "soft" errors - just return empty markers
    // This prevents error toasts for cases like "subscription required"
    console.warn("[useMapMarkers] RPC returned error:", result.error);
    return [];
  }

  // Handle null/undefined items gracefully
  if (!result.items) {
    console.warn("[useMapMarkers] RPC returned null items");
    return [];
  }

  const markers = result.items ?? [];
  console.log("[useMapMarkers] Total markers fetched:", markers.length);
  return markers;
}

export function useMapMarkers(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: ["map-markers", filters],
    queryFn: () => fetchFilteredMarkers(filters),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 2,
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
  });
}
