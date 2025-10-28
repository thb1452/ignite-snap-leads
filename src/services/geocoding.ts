import { supabase } from "@/integrations/supabase/client";
import { callFn } from "@/integrations/http/functions";

export async function geocodeAllProperties(): Promise<{ geocoded: number; failed: number; total: number }> {
  // Get all properties without coordinates
  const { data: properties, error } = await supabase
    .from("properties")
    .select("id")
    .or("latitude.is.null,longitude.is.null");

  if (error) throw error;
  if (!properties || properties.length === 0) {
    return { geocoded: 0, failed: 0, total: 0 };
  }

  const propertyIds = properties.map(p => p.id);
  
  // Call the geocoding function
  const result = await callFn("geocode-properties", { propertyIds });
  
  return result as { geocoded: number; failed: number; total: number };
}
