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

// Max markers to request for a given map bounds.
// This app relies on clustering on the client, so we can load more than 1000
// while still keeping marker rendering responsive via batching in the map component.
const VIEWPORT_LIMIT = 60000;

// Debounce time in ms to avoid excessive API calls during pan/zoom
const DEBOUNCE_MS = 300;

export function useViewportMarkers(filters: LeadFilters = {}) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [totalInBounds, setTotalInBounds] = useState(0);
  
  // Track the last fetched bounds to avoid duplicate requests
  const lastBoundsRef = useRef<MapBounds | null>(null);
  // Prevent out-of-order responses from overwriting newer bounds results.
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchMarkersInBounds = useCallback(async (bounds: MapBounds) => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the request
    debounceTimerRef.current = setTimeout(async () => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        // Validate bounds
        if (!bounds || typeof bounds.minLat !== 'number' || typeof bounds.maxLat !== 'number' ||
            typeof bounds.minLng !== 'number' || typeof bounds.maxLng !== 'number') {
          throw new Error("Invalid map bounds");
        }

        if (bounds.minLat >= bounds.maxLat || bounds.minLng >= bounds.maxLng) {
          throw new Error("Invalid map bounds: min must be less than max");
        }

        if (import.meta.env.DEV) {
          console.log("[useViewportMarkers] Fetching markers in bounds:", bounds);
        }

        // Use the RPC function with explicit range header to get more than 1000 rows
        // PostgREST limits default responses to 1000 rows, we need to specify the range
        // Apply filters with defensive checks
        const { data, error: rpcError } = await supabase
          .rpc("fn_map_markers_in_bounds", {
            p_min_lat: bounds.minLat,
            p_max_lat: bounds.maxLat,
            p_min_lng: bounds.minLng,
            p_max_lng: bounds.maxLng,
            p_state: filters.state && typeof filters.state === 'string' ? filters.state : null,
            p_city: filters.cities && Array.isArray(filters.cities) && filters.cities.length === 1 && typeof filters.cities[0] === 'string'
              ? filters.cities[0]
              : null,
            p_category: filters.violationType && typeof filters.violationType === 'string' ? filters.violationType : null,
            p_snap_min: filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[0] === 'number'
              ? filters.snapScoreRange[0]
              : null,
            p_snap_max: filters.snapScoreRange && Array.isArray(filters.snapScoreRange) && typeof filters.snapScoreRange[1] === 'number'
              ? filters.snapScoreRange[1]
              : null,
            p_limit: VIEWPORT_LIMIT,
          })
          .range(0, VIEWPORT_LIMIT - 1); // Request range 0-9999 (10,000 rows)

        if (rpcError) {
          console.error("[useViewportMarkers] RPC error:", rpcError);
          throw new Error(`Failed to load map markers: ${rpcError.message}`);
        }

        // Defensive check for data
        const fetchedMarkers = Array.isArray(data) ? (data as MapMarker[]) : [];
        
        if (import.meta.env.DEV) {
          console.log(`[useViewportMarkers] Loaded ${fetchedMarkers.length} markers in viewport`);
        }

        // Only commit if this is the latest request.
        if (requestId === requestIdRef.current) {
          setMarkers(fetchedMarkers);
          setTotalInBounds(fetchedMarkers.length);
          lastBoundsRef.current = bounds;
        }
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
