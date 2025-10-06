import { supabase } from "@/integrations/supabase/client";

export type PropertyContact = {
  id: string; property_id: string; name: string | null; phone: string | null; email: string | null;
  source: string | null; raw_payload: any; created_at: string;
};

export async function listPropertyContacts(propertyId: string): Promise<PropertyContact[]> {
  const { data, error } = await supabase
    .from("property_contacts")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
