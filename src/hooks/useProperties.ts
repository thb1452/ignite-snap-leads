import { useQuery } from "@tanstack/react-query";
import { fetchPropertiesPaged } from "@/services/properties";
import { LeadFiltersSchema } from "@/schemas";

export function useProperties(page: number, pageSize: number, filters: unknown) {
  const parsed = LeadFiltersSchema.parse(filters ?? {});
  return useQuery({
    queryKey: ["properties", page, pageSize, parsed],
    queryFn: () => fetchPropertiesPaged(page, pageSize, parsed),
    placeholderData: (previousData) => previousData,
  });
}
