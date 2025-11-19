import { useQuery } from "@tanstack/react-query";

export function usePropertyContacts(propertyId: string) {
  return useQuery({
    queryKey: ["property-contacts", propertyId],
    queryFn: async () => {
      // Demo mode - return empty contacts
      return [];
    },
    enabled: !!propertyId,
  });
}

export function useMultiplePropertyContacts(propertyIds: string[]) {
  return useQuery({
    queryKey: ["multiple-property-contacts", propertyIds.join(",")],
    queryFn: async () => {
      // Demo mode - return empty contacts
      return {};
    },
    enabled: propertyIds.length > 0,
  });
}
