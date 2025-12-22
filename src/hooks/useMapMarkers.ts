import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  snap_score: number | null;
  address: string;
}

const BATCH_SIZE = 1000;

async function fetchAllMarkers(): Promise<MapMarker[]> {
  console.log("[useMapMarkers] Fetching all map markers in batches...");
  const allMarkers: MapMarker[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("properties")
      .select("id, latitude, longitude, snap_score, address")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("snap_score", { ascending: false, nullsFirst: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("[useMapMarkers] Error fetching batch at offset", offset, error);
      throw error;
    }

    if (data && data.length > 0) {
      allMarkers.push(...(data as MapMarker[]));
      offset += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
      console.log("[useMapMarkers] Fetched batch, total so far:", allMarkers.length);
    } else {
      hasMore = false;
    }
  }

  console.log("[useMapMarkers] Total markers fetched:", allMarkers.length);
  return allMarkers;
}

export function useMapMarkers() {
  return useQuery({
    queryKey: ["map-markers"],
    queryFn: fetchAllMarkers,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
