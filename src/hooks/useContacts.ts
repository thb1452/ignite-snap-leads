import { useQuery } from "@tanstack/react-query";
import { listPropertyContacts } from "@/services/contacts";
import { z } from "zod";
import { PropertyContactSchema } from "@/schemas";

export function usePropertyContacts(propertyId?: string) {
  return useQuery({
    enabled: !!propertyId,
    queryKey: ["contacts", propertyId],
    queryFn: async () => {
      const data = await listPropertyContacts(propertyId!);
      const parsed = z.array(PropertyContactSchema).parse(data); // strong parse
      return parsed;
    },
  });
}
