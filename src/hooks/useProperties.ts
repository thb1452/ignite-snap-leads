import { useQuery } from "@tanstack/react-query";
import { fetchPropertiesPaged } from "@/services/properties";
import { LeadFiltersSchema, type LeadFilters } from "@/schemas";

export function useProperties(page: number, pageSize: number, filters: unknown) {
  let parsed: LeadFilters;
  try {
    parsed = LeadFiltersSchema.parse(filters ?? {}) as LeadFilters;
  } catch (e) {
    console.error("[useProperties] Filter parse error:", e);
    parsed = {}; // fallback to empty filters
  }
  
  return useQuery({
    queryKey: ["properties", page, pageSize, parsed],
    queryFn: async () => {
      console.log("[useProperties] Fetching page", page, "with filters", parsed);
      const result = await fetchPropertiesPaged(page, pageSize, parsed);
      console.log("[useProperties] Fetched", result.data?.length, "properties, total:", result.total);
      return result;
    },
    placeholderData: (prev) => prev,
  });
}
