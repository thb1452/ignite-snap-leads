import { useState, useCallback, useRef } from "react";
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

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// Limit per viewport load - balance between coverage and performance
const VIEWPORT_LIMIT = 10000;

// Debounce time in ms to avoid excessive API calls during pan/zoom
const DEBOUNCE_MS = 300;

export function useViewportMarkers(filters: LeadFilters = {}) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [totalInBounds, setTotalInBounds] = useState(0);
  
  // Track the last fetched bounds to avoid duplicate requests
  const lastBoundsRef = useRef<MapBounds | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMarkersInBounds = useCallback(async (bounds: MapBounds) => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the request
    debounceTimerRef.current = setTimeout(async () => {
      // Skip if bounds haven't changed significantly
      const lastBounds = lastBoundsRef.current;
      if (lastBounds) {
        const latDiff = Math.abs(bounds.minLat - lastBounds.minLat) + Math.abs(bounds.maxLat - lastBounds.maxLat);
        const lngDiff = Math.abs(bounds.minLng - lastBounds.minLng) + Math.abs(bounds.maxLng - lastBounds.maxLng);
        // If the change is very small, skip
        if (latDiff < 0.01 && lngDiff < 0.01) {
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log("[useViewportMarkers] Fetching markers in bounds:", bounds);

        // Use the RPC function with explicit range header to get more than 1000 rows
        // PostgREST limits default responses to 1000 rows, we need to specify the range
        const { data, error: rpcError } = await supabase
          .rpc("fn_map_markers_in_bounds", {
            p_min_lat: bounds.minLat,
            p_max_lat: bounds.maxLat,
            p_min_lng: bounds.minLng,
            p_max_lng: bounds.maxLng,
            p_state: filters.state || null,
            p_city: filters.cities?.length === 1 ? filters.cities[0] : null,
            p_category: filters.violationType || null,
            p_snap_min: filters.snapScoreRange?.[0] ?? null,
            p_snap_max: filters.snapScoreRange?.[1] ?? null,
            p_limit: VIEWPORT_LIMIT,
          })
          .range(0, VIEWPORT_LIMIT - 1); // Request range 0-9999 (10,000 rows)

        if (rpcError) {
          console.error("[useViewportMarkers] RPC error:", rpcError);
          throw rpcError;
        }

        const fetchedMarkers = (data || []) as MapMarker[];
        console.log(`[useViewportMarkers] Loaded ${fetchedMarkers.length} markers in viewport`);

        setMarkers(fetchedMarkers);
        setTotalInBounds(fetchedMarkers.length);
        lastBoundsRef.current = bounds;
      } catch (err) {
        console.error("[useViewportMarkers] Error:", err);
        setError(err instanceof Error ? err : new Error("Failed to load markers"));
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);
  }, [filters]);

  // Reset when filters change
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
