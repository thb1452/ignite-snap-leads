import { useQuery } from "@tanstack/react-query";
import { fetchPropertiesPaged } from "@/services/properties";
import { LeadFiltersSchema, type LeadFilters } from "@/schemas";

// Clean filter object by removing undefined/null values
function cleanFilters(filters: unknown): LeadFilters {
  if (!filters || typeof filters !== 'object') return {};
  
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    // Skip undefined, null, empty strings, and empty arrays
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    cleaned[key] = value;
  }
  
  return cleaned as LeadFilters;
}

export function useProperties(page: number, pageSize: number, filters: unknown) {
  // Clean the filters first, then validate with Zod
  const cleaned = cleanFilters(filters);
  
  let parsed: LeadFilters;
  try {
    parsed = LeadFiltersSchema.parse(cleaned);
  } catch (e) {
    console.error("[useProperties] Filter parse error:", e);
    parsed = cleaned; // Use cleaned filters as fallback
  }
  
  return useQuery({
    queryKey: ["properties", page, pageSize, parsed],
    queryFn: async () => {
      console.log("[useProperties] Fetching page", page, "with filters:", JSON.stringify(parsed));
      const result = await fetchPropertiesPaged(page, pageSize, parsed);
      console.log("[useProperties] Fetched", result.data?.length, "properties, total:", result.total);
      return result;
    },
    placeholderData: (prev) => prev,
    retry: 1,
    staleTime: 30000,
  });
}
