import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePropertyContacts(propertyId: string) {
  return useQuery({
    queryKey: ["property-contacts", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_contacts")
        .select("*")
        .eq("property_id", propertyId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });
}

export function useMultiplePropertyContacts(propertyIds: string[]) {
  return useQuery({
    queryKey: ["multiple-property-contacts", propertyIds.join(",")],
    queryFn: async () => {
      if (propertyIds.length === 0) return {};

      const { data, error } = await supabase
        .from("property_contacts")
        .select("*")
        .in("property_id", propertyIds);

      if (error) throw error;

      // Group by property_id
      const grouped: Record<string, any[]> = {};
      (data || []).forEach(contact => {
        if (!grouped[contact.property_id]) {
          grouped[contact.property_id] = [];
        }
        grouped[contact.property_id].push(contact);
      });

      return grouped;
    },
    enabled: propertyIds.length > 0,
  });
}
