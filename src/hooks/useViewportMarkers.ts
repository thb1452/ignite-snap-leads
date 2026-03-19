import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/externalClient";
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

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Upper bound passed to RPC LIMIT — must cover all markers in viewport for PostgREST range slicing */
const VIEWPORT_LIMIT = 60000;

/** Supabase / Lovable max_rows per HTTP response */
const BATCH_SIZE = 1000;

// Debounce time in ms to avoid excessive API calls during pan/zoom
const DEBOUNCE_MS = 400;

function buildMapMarkersRpcParams(bounds: MapBounds, filters: LeadFilters) {
  return {
    p_min_lat: bounds.minLat,
    p_max_lat: bounds.maxLat,
    p_min_lng: bounds.minLng,
    p_max_lng: bounds.maxLng,
    p_state: filters.state && typeof filters.state === "string" ? filters.state : null,
    p_city:
      filters.cities && Array.isArray(filters.cities) && filters.cities.length === 1 && typeof filters.cities[0] === "string"
        ? filters.cities[0]
        : null,
    p_category: filters.violationType && typeof filters.violationType === "string" ? filters.violationType : null,
    p_snap_min:
      filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[0] === "number"
        ? filters.snapScoreRange[0]
        : null,
    p_snap_max:
      filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[1] === "number"
        ? filters.snapScoreRange[1]
        : null,
    p_search: filters.search && typeof filters.search === "string" ? filters.search.trim() || null : null,
    p_last_seen_days:
      filters.lastSeenDays !== undefined && filters.lastSeenDays !== null && typeof filters.lastSeenDays === "number" && filters.lastSeenDays > 0
        ? filters.lastSeenDays
        : null,
    p_open_violations_only: filters.openViolationsOnly === true,
    p_multiple_violations_only: filters.multipleViolationsOnly === true,
    p_repeat_offender_only: filters.repeatOffenderOnly === true,
    p_limit: VIEWPORT_LIMIT,
  };
}

/**
 * Fetch all markers for the viewport by paging in 1000-row batches (Lovable / Supabase max_rows cap).
 * Aborts if `isStale()` returns true after any await (e.g. user panned again).
 */
async function fetchAllMarkersInBatches(
  bounds: MapBounds,
  filters: LeadFilters,
  isStale: () => boolean
): Promise<MapMarker[]> {
  const params = buildMapMarkersRpcParams(bounds, filters);
  const allData: MapMarker[] = [];
  let from = 0;

  while (from < VIEWPORT_LIMIT) {
    if (isStale()) {
      return [];
    }

    const { data, error: rpcError } = await supabase
      .rpc("fn_map_markers_in_bounds", params)
      .range(from, from + BATCH_SIZE - 1);

    if (isStale()) {
      return [];
    }

    if (rpcError) {
      console.error("[useViewportMarkers] RPC error:", rpcError);
      throw new Error(`Failed to load map markers: ${rpcError.message}`);
    }

    const batch = Array.isArray(data) ? (data as MapMarker[]) : [];
    if (batch.length === 0) {
      break;
    }

    allData.push(...batch);

    if (batch.length < BATCH_SIZE) {
      break;
    }

    from += BATCH_SIZE;

    // Yield so the main thread can paint between network batches
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  if (allData.length >= VIEWPORT_LIMIT) {
    console.warn("[useViewportMarkers] Hit VIEWPORT_LIMIT; map may be truncated for this viewport.");
  }

  return allData;
}

export function useViewportMarkers(filters: LeadFilters = {}) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [totalInBounds, setTotalInBounds] = useState(0);

  const lastBoundsRef = useRef<MapBounds | null>(null);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMarkersInBounds = useCallback(
    (bounds: MapBounds) => {
      // Skip if bounds match last fetch (avoids duplicate requests on duplicate events)
      if (
        lastBoundsRef.current &&
        Math.abs(lastBoundsRef.current.minLat - bounds.minLat) < 1e-6 &&
        Math.abs(lastBoundsRef.current.maxLat - bounds.maxLat) < 1e-6 &&
        Math.abs(lastBoundsRef.current.minLng - bounds.minLng) < 1e-6 &&
        Math.abs(lastBoundsRef.current.maxLng - bounds.maxLng) < 1e-6
      ) {
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        setIsLoading(true);
        setError(null);

        try {
          if (
            !bounds ||
            typeof bounds.minLat !== "number" ||
            typeof bounds.maxLat !== "number" ||
            typeof bounds.minLng !== "number" ||
            typeof bounds.maxLng !== "number"
          ) {
            throw new Error("Invalid map bounds");
          }

          if (bounds.minLat >= bounds.maxLat || bounds.minLng >= bounds.maxLng) {
            throw new Error("Invalid map bounds: min must be less than max");
          }

          if (import.meta.env.DEV) {
            console.log("[useViewportMarkers] Fetching markers in bounds (batched):", bounds);
          }

          const isStale = () => requestId !== requestIdRef.current;

          const fetchedMarkers = await fetchAllMarkersInBatches(bounds, filters, isStale);

          if (isStale()) {
            return;
          }

          if (import.meta.env.DEV) {
            console.log(`[useViewportMarkers] Loaded ${fetchedMarkers.length} markers in viewport (batched)`);
          }

          setMarkers(fetchedMarkers);
          setTotalInBounds(fetchedMarkers.length);
          lastBoundsRef.current = bounds;
        } catch (err) {
          console.error("[useViewportMarkers] Error:", err);
          if (requestId === requestIdRef.current) {
            setError(err instanceof Error ? err : new Error("Failed to load markers"));
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setIsLoading(false);
          }
        }
      }, DEBOUNCE_MS);
    },
    [filters]
  );

  const resetMarkers = useCallback(() => {
    setMarkers([]);
    setTotalInBounds(0);
    lastBoundsRef.current = null;
  }, []);

  return {
    markers,
    isLoading,
    error,
    totalInBounds,
    fetchMarkersInBounds,
    resetMarkers,
  };
}
