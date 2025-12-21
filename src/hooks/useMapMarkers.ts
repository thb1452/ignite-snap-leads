import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MapMarker {
  id: string;
  latitude: number | null;
  longitude: number | null;
  snap_score: number | null;
  address: string;
}

export function useMapMarkers() {
  return useQuery({
    queryKey: ["map-markers"],
    queryFn: async (): Promise<MapMarker[]> => {
      // Fetch only essential fields for map markers - much lighter than full properties
      const { data, error } = await supabase
        .from("properties")
        .select("id, latitude, longitude, snap_score, address")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("snap_score", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
