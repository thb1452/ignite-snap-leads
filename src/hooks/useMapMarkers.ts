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
}

const BATCH_SIZE = 1000; // Supabase default limit
const MAX_MARKERS = 200000;

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
  const allMarkers: MapMarker[] = [];
  let offset = 0;
  let keepFetching = true;

  while (keepFetching && allMarkers.length < MAX_MARKERS) {
    let query = supabase
      .from("properties")
      .select("id, latitude, longitude, snap_score, address, city, state")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    // Apply filters
    if (filters.state) {
      query = query.ilike("state", filters.state);
    }

    if (filters.county) {
      query = query.ilike("county", `%${filters.county}%`);
    }

    if (filters.cities?.length) {
      query = query.in("city", filters.cities);
    }

    if (filters.snapScoreRange) {
      const [min, max] = filters.snapScoreRange;
      query = query.gte("snap_score", min).lte("snap_score", max);
    }

    // Search across multiple columns
    if (filters.search) {
      const s = filters.search.trim();
      query = query.or(`address.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%,county.ilike.%${s}%,zip.ilike.%${s}%`);
    }

    // Jurisdiction filter (could be UUID or city|state format)
    if (filters.jurisdictionId) {
      if (filters.jurisdictionId.includes('|')) {
        const [city, state] = filters.jurisdictionId.split('|');
        query = query.ilike("city", city).ilike("state", state);
      } else {
        query = query.eq("jurisdiction_id", filters.jurisdictionId);
      }
    }

    // Last seen days filter
    if (filters.lastSeenDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.lastSeenDays);
      query = query.gte("updated_at", cutoffDate.toISOString());
    }

    // Violation type filter
    if (filters.violationType) {
      query = query.contains("violation_types", [filters.violationType]);
    }

    const { data, error } = await query
      .order("snap_score", { ascending: false, nullsFirst: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("[useMapMarkers] Error fetching batch at offset", offset, error);
      throw error;
    }

    const batchCount = data?.length ?? 0;
    if (batchCount > 0) {
      allMarkers.push(...(data as MapMarker[]));
      console.log("[useMapMarkers] Fetched batch:", batchCount, "total so far:", allMarkers.length);
      offset += BATCH_SIZE;
      // Continue if we got a full batch (there might be more)
      keepFetching = batchCount >= BATCH_SIZE;
    } else {
      keepFetching = false;
    }
  }

  console.log("[useMapMarkers] Total markers fetched:", allMarkers.length);
  return allMarkers;
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
