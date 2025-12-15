/**
 * React Query hooks for properties
 * Phase 4: Performance - Centralized data fetching with caching
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { isProperty } from '@/lib/type-guards';

type Property = Database['public']['Tables']['properties']['Row'];
type Violation = Database['public']['Tables']['violations']['Row'];

// ============================================================================
// QUERY KEYS
// ============================================================================

export const propertiesKeys = {
  all: ['properties'] as const,
  lists: () => [...propertiesKeys.all, 'list'] as const,
  list: (filters: PropertiesFilters) => [...propertiesKeys.lists(), filters] as const,
  details: () => [...propertiesKeys.all, 'detail'] as const,
  detail: (id: string) => [...propertiesKeys.details(), id] as const,
  violations: (id: string) => [...propertiesKeys.detail(id), 'violations'] as const,
};

// ============================================================================
// TYPES
// ============================================================================

export interface PropertiesFilters {
  city?: string;
  snapScoreMin?: number;
  snapScoreMax?: number;
  jurisdictionId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PropertiesResponse {
  data: Property[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PropertyWithViolations extends Property {
  violations: Violation[];
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch paginated properties with filters
 */
export function usePropertiesQuery(filters: PropertiesFilters = {}) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 25;

  return useQuery({
    queryKey: propertiesKeys.list(filters),
    queryFn: async (): Promise<PropertiesResponse> => {
      let query = supabase
        .from('properties')
        .select('*', { count: 'exact' })
        .order('snap_score', { ascending: false, nullsFirst: false });

      // Apply filters
      if (filters.city) {
        query = query.eq('city', filters.city);
      }

      if (filters.snapScoreMin !== undefined) {
        query = query.gte('snap_score', filters.snapScoreMin);
      }

      if (filters.snapScoreMax !== undefined) {
        query = query.lte('snap_score', filters.snapScoreMax);
      }

      if (filters.jurisdictionId) {
        query = query.eq('jurisdiction_id', filters.jurisdictionId);
      }

      if (filters.search) {
        query = query.or(`address.ilike.%${filters.search}%,city.ilike.%${filters.search}%`);
      }

      // Apply pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const totalPages = count ? Math.ceil(count / pageSize) : 0;

      return {
        data: data || [],
        count: count || 0,
        page,
        pageSize,
        totalPages,
      };
    },
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
  });
}

/**
 * Fetch single property with violations
 */
export function usePropertyQuery(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: propertiesKeys.detail(propertyId || ''),
    queryFn: async (): Promise<PropertyWithViolations | null> => {
      if (!propertyId) return null;

      const { data, error } = await supabase
        .from('properties')
        .select(`
          *,
          violations (*)
        `)
        .eq('id', propertyId)
        .single();

      if (error) throw error;
      if (!data) return null;

      return data as PropertyWithViolations;
    },
    enabled: !!propertyId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch property violations
 */
export function usePropertyViolationsQuery(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: propertiesKeys.violations(propertyId || ''),
    queryFn: async (): Promise<Violation[]> => {
      if (!propertyId) return [];

      const { data, error } = await supabase
        .from('violations')
        .select('*')
        .eq('property_id', propertyId)
        .order('opened_date', { ascending: false, nullsFirst: false });

      if (error) throw error;

      return data || [];
    },
    enabled: !!propertyId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch cities for filter dropdown
 */
export function useCitiesQuery() {
  return useQuery({
    queryKey: [...propertiesKeys.all, 'cities'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('properties')
        .select('city')
        .order('city');

      if (error) throw error;

      // Get unique cities
      const cities = Array.from(new Set(data?.map(d => d.city).filter(Boolean))) as string[];
      return cities.sort();
    },
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Update property mutation
 */
export function useUpdatePropertyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Property> }) => {
      const { data, error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate queries that might be affected
      queryClient.invalidateQueries({ queryKey: propertiesKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: propertiesKeys.lists() });
    },
  });
}

/**
 * Delete property mutation
 */
export function useDeletePropertyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (propertyId: string) => {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all property lists
      queryClient.invalidateQueries({ queryKey: propertiesKeys.lists() });
    },
  });
}

// ============================================================================
// PREFETCH HELPERS
// ============================================================================

/**
 * Prefetch property details
 * Useful for hover states to reduce perceived load time
 */
export function usePrefetchProperty() {
  const queryClient = useQueryClient();

  return (propertyId: string) => {
    queryClient.prefetchQuery({
      queryKey: propertiesKeys.detail(propertyId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('properties')
          .select(`
            *,
            violations (*)
          `)
          .eq('id', propertyId)
          .single();

        if (error) throw error;
        return data;
      },
      staleTime: 60000,
    });
  };
}
