import { supabase } from "@/integrations/supabase/client";

export async function bulkDeletePropertiesByCityOrState(cityOrState: string): Promise<{ deleted: number }> {
  const normalized = cityOrState.trim().toUpperCase();
  
  try {
    // First, get all property IDs that match the city or state
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id")
      .or(`city.ilike.${normalized},state.ilike.${normalized}`);

    if (fetchError) throw fetchError;

    if (!properties || properties.length === 0) {
      return { deleted: 0 };
    }

    const propertyIds = properties.map(p => p.id);

    // Delete violations first (due to foreign key constraints)
    const { error: violationsError } = await supabase
      .from("violations")
      .delete()
      .in("property_id", propertyIds);

    if (violationsError) throw violationsError;

    // Delete properties
    const { error: propertiesError } = await supabase
      .from("properties")
      .delete()
      .in("id", propertyIds);

    if (propertiesError) throw propertiesError;

    return { deleted: propertyIds.length };
  } catch (error) {
    console.error("Bulk delete error:", error);
    throw error;
  }
}