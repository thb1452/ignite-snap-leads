import { useQuery } from "@tanstack/react-query";
import { fetchPropertiesPaged } from "@/services/properties";
import { LeadFiltersSchema, type LeadFilters } from "@/schemas";
import { cleanFilters, validateFilters, logFilters } from "@/utils/filterUtils";

export function useProperties(page: number, pageSize: number, filters: unknown) {
  // Clean the filters first, then validate
  const cleaned = cleanFilters(filters);
  
  // Validate filters with Zod schema
  let parsed: LeadFilters;
  try {
    parsed = LeadFiltersSchema.parse(cleaned);
  } catch (e) {
    console.error("[useProperties] Filter parse error:", e);
    // Use cleaned filters as fallback, but log warning
    parsed = cleaned as LeadFilters;
  }
  
  // Additional validation for edge cases
  const validation = validateFilters(parsed);
  if (!validation.valid) {
    console.warn("[useProperties] Filter validation errors:", validation.errors);
  }
  
  logFilters("useProperties", parsed);
  
  return useQuery({
    queryKey: ["properties", page, pageSize, parsed],
    queryFn: async () => {
      if (import.meta.env.DEV) {
        console.log("[useProperties] Fetching page", page, "with filters:", JSON.stringify(parsed));
      }
      const result = await fetchPropertiesPaged(page, pageSize, parsed);
      if (import.meta.env.DEV) {
        console.log("[useProperties] Fetched", result.data?.length, "properties, total:", result.total, "dataTier:", result.dataTier);
      }
      return result;
    },
    placeholderData: (prev) => prev,
    retry: 1,
    staleTime: 30000,
    // Don't refetch if filters are invalid
    enabled: validation.valid,
  });
}

// Export type for components that need it
export interface PropertiesResult {
  data: any[];
  total: number;
  dataTier: string | null;
}
