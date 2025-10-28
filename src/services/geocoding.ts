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
    
    // Call the geocoding function
    const result = await callFn("geocode-properties", { propertyIds });
    
    console.log("Geocoding result:", result);
    
    return result as { geocoded: number; failed: number; total: number };
  } catch (error) {
    console.error("Geocoding error:", error);
    throw error;
  }
}
