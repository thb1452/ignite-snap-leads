import { useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/externalClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SubscriptionPlan,
  UserSubscription,
  UsageTracking,
  LimitCheckResult,
  UsageType,
  PlanTierName,
} from "@/types/subscription";

// Re-export types for convenience
export type { SubscriptionPlan, UserSubscription, UsageTracking, LimitCheckResult, UsageType };

// Fetch user's active subscription
async function fetchSubscription(userId: string): Promise<UserSubscription | null> {
  const { data, error } = await supabase.rpc('fn_get_user_subscription', { 
    p_user_id: userId 
  });
  
  if (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
  
  // RPC returns an array, get the first item
  if (Array.isArray(data) && data.length > 0) {
    const row = data[0];
    return {
      ...row,
      plan_name: row.plan_name as PlanTierName,
    } as UserSubscription;
  }
  
  return null;
}

// Fetch current usage
async function fetchUsage(userId: string): Promise<UsageTracking | null> {
  type CurrentUsageRpcResult = UsageTracking | UsageTracking[] | null;

  const { data, error } = await supabase.rpc('fn_get_current_usage', {
    p_user_id: userId
  });
  
  if (error) {
    console.error('Error fetching usage:', error);
    return null;
  }
  
  const result = data as unknown as CurrentUsageRpcResult;

  // RPC now returns jsonb directly (not an array)
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return result as UsageTracking;
  }
  
  // Legacy: RPC might return array in some cases
  if (Array.isArray(result) && result.length > 0) {
    return result[0] as UsageTracking;
  }
  
  return null;
}

// Check subscription limit
async function checkLimit(
  usageType: UsageType,
  amount: number = 1
): Promise<LimitCheckResult> {
  const { data, error } = await supabase.rpc('fn_check_subscription_limit', {
    p_usage_type: usageType,
    p_amount: amount
  });
  
  if (error) {
    console.error('Error checking limit:', error);
    return {
      allowed: false,
      reason: 'error',
      message: 'Failed to check subscription limit'
    };
  }
  
  return data as unknown as LimitCheckResult;
}

// Increment usage counter
async function incrementUsage(
  usageType: UsageType,
  amount: number = 1
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_increment_usage', {
    p_usage_type: usageType,
    p_amount: amount
  });
  
  if (error) {
    console.error('Error incrementing usage:', error);
    return false;
  }
  
  return data === true;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch subscription
  const { 
    data: subscription, 
    isLoading: subscriptionLoading,
    error: subscriptionError,
    refetch: refetchSubscription
  } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: () => fetchSubscription(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch usage
  const { 
    data: usage, 
    isLoading: usageLoading,
    refetch: refetchUsage
  } = useQuery({
    queryKey: ['subscription-usage', user?.id],
    queryFn: () => fetchUsage(user!.id),
    enabled: !!user?.id,
    staleTime: 30 * 1000, // 30 seconds - balance between freshness and performance
    refetchOnMount: false, // Use stale data if available
    refetchOnWindowFocus: false, // Only refetch when explicitly requested
  });

  // Build plan object from subscription data
  const plan: SubscriptionPlan | null = subscription ? {
    id: subscription.plan_id,
    name: subscription.plan_name,
    display_name: subscription.display_name,
    description: null,
    price_monthly_cents: 0,
    max_monthly_exports: subscription.max_monthly_exports,
    max_counties: subscription.max_counties,
    max_user_seats: subscription.max_user_seats,
    has_advanced_filters: subscription.has_advanced_filters,
    has_violation_filtering: subscription.has_violation_filtering,
    has_rolling_intelligence: subscription.has_rolling_intelligence,
    has_escalation_alerts: subscription.has_escalation_alerts,
    has_api_access: subscription.has_api_access,
    has_dedicated_manager: false,
    features: []
  } : null;

  // Check if user can perform action
  const checkSubscriptionLimit = useCallback(async (
    usageType: UsageType,
    amount: number = 1
  ): Promise<LimitCheckResult> => {
    if (!user?.id) {
      return {
        allowed: false,
        reason: 'no_user',
        message: 'Please log in to continue'
      };
    }
    return checkLimit(usageType, amount);
  }, [user?.id]);

  // Increment usage and invalidate cache
  const trackUsage = useCallback(async (
    usageType: UsageType,
    amount: number = 1
  ): Promise<boolean> => {
    const success = await incrementUsage(usageType, amount);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['subscription-usage', user?.id] });
    }
    return success;
  }, [user?.id, queryClient]);

  // Usage percentage calculations
  const getUsagePercentage = useCallback((type: 'exports'): number | null => {
    if (!plan || !usage) return 0;
    if (plan.max_monthly_exports === -1) return null;
    return (usage.exports_count / plan.max_monthly_exports) * 100;
  }, [plan, usage]);

  // Returns null for unlimited plans
  const getRemainingCount = useCallback((type: 'exports'): number | null => {
    if (!plan || !usage) return 0;
    if (plan.max_monthly_exports === -1) return null;
    return Math.max(0, plan.max_monthly_exports - usage.exports_count);
  }, [plan, usage]);

  const isAtLimit = useCallback((type: 'exports'): boolean => {
    if (!plan || !usage) return false;
    if (plan.max_monthly_exports === -1) return false;
    return usage.exports_count >= plan.max_monthly_exports;
  }, [plan, usage]);

  // Refetch both subscription and usage
  const refetch = useCallback(async () => {
    await Promise.all([refetchSubscription(), refetchUsage()]);
  }, [refetchSubscription, refetchUsage]);

  return {
    subscription,
    plan,
    usage,
    loading: subscriptionLoading || usageLoading,
    error: subscriptionError?.message || null,
    hasActiveSubscription: !!subscription && ['active', 'trialing', 'past_due', 'trial'].includes(subscription.status),
    
    // Limit checking
    checkLimit: checkSubscriptionLimit,
    trackUsage,
    
    // Usage helpers
    getUsagePercentage,
    getRemainingCount,
    isAtLimit,
    
    // Refetch
    refetch,
  };
}
