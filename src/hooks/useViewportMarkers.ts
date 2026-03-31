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

/** Upper bound passed to RPC LIMIT — keep low to prevent 60+ sequential batch fetches.
 *  At zoom levels where more than 2,000 markers would be in-viewport, the map is
 *  too zoomed-out to show individual pins usefully anyway (clustering handles display).
 *  Raise only if the map clustering layer can handle denser data. */
const VIEWPORT_LIMIT = 2000;

/** Supabase max_rows per response */
const BATCH_SIZE = 1000;

const DEBOUNCE_MS = 400;

/** Avoid re-fetch loops from float noise or map settle after clusters */
const BOUNDS_EPS = 1e-4;

function boundsNearlyEqual(a: MapBounds | null, b: MapBounds): boolean {
  if (!a) return false;
  return (
    Math.abs(a.minLat - b.minLat) < BOUNDS_EPS &&
    Math.abs(a.maxLat - b.maxLat) < BOUNDS_EPS &&
    Math.abs(a.minLng - b.minLng) < BOUNDS_EPS &&
    Math.abs(a.maxLng - b.maxLng) < BOUNDS_EPS
  );
}

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
 * Fetch all markers in batches, merge in memory, return once complete.
 * Single state update on completion — no progressive updates that cause effect loops.
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
    if (isStale()) return [];

    const { data, error: rpcError } = await supabase
      .rpc("fn_map_markers_in_bounds", params)
      .range(from, from + BATCH_SIZE - 1);

    if (isStale()) return [];

    if (rpcError) {
      console.error("[useViewportMarkers] RPC error:", rpcError);
      throw new Error(`Failed to load map markers: ${rpcError.message}`);
    }

    const batch = Array.isArray(data) ? (data as MapMarker[]) : [];
    if (batch.length === 0) break;

    allData.push(...batch);

    if (batch.length < BATCH_SIZE) break;

    from += BATCH_SIZE;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
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
      if (boundsNearlyEqual(lastBoundsRef.current, bounds)) return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(async () => {
        if (boundsNearlyEqual(lastBoundsRef.current, bounds)) return;

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        lastBoundsRef.current = bounds;

        setIsLoading(true);
        setError(null);
        setMarkers([]);
        setTotalInBounds(0);

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

          const isStale = () => requestId !== requestIdRef.current;

          const fetchedMarkers = await fetchAllMarkersInBatches(bounds, filters, isStale);

          if (isStale()) return;

          setMarkers(fetchedMarkers);
          setTotalInBounds(fetchedMarkers.length);
        } catch (err) {
          console.error("[useViewportMarkers] Error:", err);
          if (requestId === requestIdRef.current) {
            lastBoundsRef.current = null;
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
