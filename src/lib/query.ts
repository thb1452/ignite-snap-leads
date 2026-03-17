import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - increased from 1 min for better caching
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime) - keep cached data longer
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on mount if data is fresh
      retry: 1,
    },
  },
});
