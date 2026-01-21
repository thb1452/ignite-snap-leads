import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from './useSubscription';
import { useAuth } from './use-auth';

export interface CountyLimitInfo {
  currentCount: number;
  maxAllowed: number;
  isUnlimited: boolean;
  remaining: number;
  isAtLimit: boolean;
  canAssign: (count: number) => boolean;
}

/**
 * Hook to check county assignment limits against subscription plan
 * 
 * For organization-level limit checking:
 * - Counts all counties assigned to VAs within the organization
 * - Compares against max_counties from subscription plan
 */
export function useCountyLimits(): {
  data: CountyLimitInfo | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { user } = useAuth();
  const { plan, loading: planLoading } = useSubscription();

  const { data: currentCount, isLoading: countLoading, error } = useQuery({
    queryKey: ['county-assignment-count'],
    queryFn: async () => {
      // Count all assigned counties (organization-wide)
      // For now, count all counties that have an assigned_to value
      const { count, error } = await supabase
        .from('counties')
        .select('*', { count: 'exact', head: true })
        .not('assigned_to', 'is', null);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  const isLoading = planLoading || countLoading;

  if (isLoading || currentCount === undefined || !plan) {
    return { data: null, isLoading, error: error as Error | null };
  }

  const maxAllowed = plan.max_counties;
  const isUnlimited = maxAllowed === -1;
  const remaining = isUnlimited ? Infinity : Math.max(0, maxAllowed - currentCount);
  const isAtLimit = !isUnlimited && currentCount >= maxAllowed;

  const canAssign = (count: number) => {
    if (isUnlimited) return true;
    return currentCount + count <= maxAllowed;
  };

  return {
    data: {
      currentCount,
      maxAllowed,
      isUnlimited,
      remaining: isUnlimited ? Infinity : remaining,
      isAtLimit,
      canAssign,
    },
    isLoading: false,
    error: null,
  };
}
