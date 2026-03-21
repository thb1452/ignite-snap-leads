import { useQuery } from "@tanstack/react-query";
import { listPropertyContacts, PropertyContact } from "@/services/contacts";

export function usePropertyContacts(propertyId: string) {
  return useQuery<PropertyContact[]>({
    queryKey: ["property-contacts", propertyId],
    queryFn: () => listPropertyContacts(propertyId),
    enabled: !!propertyId,
    staleTime: 60000,
  });
}

export function useMultiplePropertyContacts(propertyIds: string[]) {
  return useQuery<Record<string, PropertyContact[]>>({
    queryKey: ["multiple-property-contacts", propertyIds.join(",")],
    queryFn: async () => {
      if (propertyIds.length === 0) return {};
      const results: Record<string, PropertyContact[]> = {};
      // Fetch in parallel, batches of 10
      for (let i = 0; i < propertyIds.length; i += 10) {
        const batch = propertyIds.slice(i, i + 10);
        const fetched = await Promise.all(batch.map(id => listPropertyContacts(id).then(c => [id, c] as const)));
        for (const [id, contacts] of fetched) {
          results[id] = contacts;
        }
      }
      return results;
    },
    enabled: propertyIds.length > 0,
    staleTime: 60000,
  });
}
