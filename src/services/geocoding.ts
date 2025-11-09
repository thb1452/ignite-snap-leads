import { supabase } from "@/integrations/supabase/client";
import { callFn } from "@/integrations/http/functions";

export async function geocodeAllProperties(): Promise<{ geocoded: number; failed: number; total: number }> {
  try {
    // Get all properties without coordinates
    const { data: properties, error } = await supabase
      .from("properties")
      .select("id")
      .or("latitude.is.null,longitude.is.null");

    if (error) {
      console.error("Error fetching properties:", error);
      throw error;
    }
    
    if (!properties || properties.length === 0) {
      return { geocoded: 0, failed: 0, total: 0 };
    }

    const propertyIds = properties.map(p => p.id);
    console.log(`Geocoding ${propertyIds.length} properties...`);

    // Batch to avoid edge function timeout limits (~60s)
    const BATCH_SIZE = 45; // ~45s with 1 req/sec rate limit
    let geocoded = 0;
    let failed = 0;
    let processed = 0;

    for (let i = 0; i < propertyIds.length; i += BATCH_SIZE) {
      const batch = propertyIds.slice(i, i + BATCH_SIZE);
      console.log(`Invoking geocode-properties for batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)`);
      try {
        const result = await callFn("geocode-properties", { propertyIds: batch });
        console.log("Geocoding batch result:", result);
        geocoded += (result as any)?.geocoded ?? 0;
        failed += (result as any)?.failed ?? 0;
        processed += (result as any)?.total ?? batch.length;
      } catch (err) {
        console.error("Batch geocoding error:", err);
        failed += batch.length;
        processed += batch.length;
      }
    }

    return { geocoded, failed, total: processed };
  } catch (error) {
    console.error("Geocoding error:", error);
    throw error;
  }
}
