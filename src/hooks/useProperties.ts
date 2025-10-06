import { useQuery } from "@tanstack/react-query";
import { fetchPropertiesPaged } from "@/services/properties";
import { LeadFiltersSchema, type LeadFilters } from "@/schemas";

export function useProperties(page: number, pageSize: number, filters: unknown) {
  const parsed = LeadFiltersSchema.parse(filters ?? {}) as LeadFilters;
  return useQuery({
    queryKey: ["properties", page, pageSize, parsed],
    queryFn: () => fetchPropertiesPaged(page, pageSize, parsed),
    placeholderData: (prev) => prev, // keeps previous page while fetching
  });
}
