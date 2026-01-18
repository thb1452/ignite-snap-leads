import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price_monthly_cents: number;
  price_annual_cents: number;
  max_monthly_exports: number;
  max_counties: number;
  max_user_seats: number;
  max_skip_traces_per_month: number;
  has_advanced_filters: boolean;
  has_violation_filtering: boolean;
  has_rolling_intelligence: boolean;
  has_escalation_alerts: boolean;
  has_api_access: boolean;
  has_dedicated_manager: boolean;
  features: string[];
}

export interface UserSubscription {
  subscription_id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  display_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  max_monthly_exports: number;
  max_counties: number;
  max_user_seats: number;
  max_skip_traces_per_month: number;
  has_advanced_filters: boolean;
  has_violation_filtering: boolean;
  has_rolling_intelligence: boolean;
  has_escalation_alerts: boolean;
  has_api_access: boolean;
  stripe_subscription_id: string | null;
}

export interface UsageTracking {
  exports_count: number;
  skip_traces_count: number;
  api_calls_count: number;
  period_start: string;
  period_end: string;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  message?: string;
  current?: number;
  limit?: number;
  remaining?: number;
  plan_name?: string;
}

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
    return data[0] as UserSubscription;
  }
  
  return null;
}

// Fetch current usage
async function fetchUsage(userId: string): Promise<UsageTracking | null> {
  const { data, error } = await supabase.rpc('fn_get_current_usage', {
    p_user_id: userId
  });
  
  if (error) {
    console.error('Error fetching usage:', error);
    return null;
  }
  
  if (Array.isArray(data) && data.length > 0) {
    return data[0] as UsageTracking;
  }
  
  return null;
}

// Check subscription limit
async function checkLimit(
  usageType: 'exports' | 'skip_traces',
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
  usageType: 'exports' | 'skip_traces' | 'api_calls',
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
    staleTime: 60 * 1000, // 1 minute
  });

  // Build plan object from subscription data
  const plan: SubscriptionPlan | null = subscription ? {
    id: subscription.plan_id,
    name: subscription.plan_name,
    display_name: subscription.display_name,
    description: null,
    price_monthly_cents: 0, // Not needed for display
    price_annual_cents: 0,
    max_monthly_exports: subscription.max_monthly_exports,
    max_counties: subscription.max_counties,
    max_user_seats: subscription.max_user_seats,
    max_skip_traces_per_month: subscription.max_skip_traces_per_month,
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
    usageType: 'exports' | 'skip_traces',
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
    usageType: 'exports' | 'skip_traces' | 'api_calls',
    amount: number = 1
  ): Promise<boolean> => {
    const success = await incrementUsage(usageType, amount);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['subscription-usage', user?.id] });
    }
    return success;
  }, [user?.id, queryClient]);

  // Usage percentage calculations
  const getUsagePercentage = useCallback((type: 'exports' | 'skip_traces'): number => {
    if (!plan || !usage) return 0;

    if (type === 'exports') {
      if (plan.max_monthly_exports === -1) return 0; // Unlimited
      return (usage.exports_count / plan.max_monthly_exports) * 100;
    } else if (type === 'skip_traces') {
      if (plan.max_skip_traces_per_month === -1) return 0;
      return (usage.skip_traces_count / plan.max_skip_traces_per_month) * 100;
    }

    return 0;
  }, [plan, usage]);

  const getRemainingCount = useCallback((type: 'exports' | 'skip_traces'): number => {
    if (!plan || !usage) return 0;

    if (type === 'exports') {
      if (plan.max_monthly_exports === -1) return Infinity;
      return Math.max(0, plan.max_monthly_exports - usage.exports_count);
    } else if (type === 'skip_traces') {
      if (plan.max_skip_traces_per_month === -1) return Infinity;
      return Math.max(0, plan.max_skip_traces_per_month - usage.skip_traces_count);
    }

    return 0;
  }, [plan, usage]);

  const isAtLimit = useCallback((type: 'exports' | 'skip_traces'): boolean => {
    if (!plan || !usage) return false;

    if (type === 'exports') {
      if (plan.max_monthly_exports === -1) return false;
      return usage.exports_count >= plan.max_monthly_exports;
    } else if (type === 'skip_traces') {
      if (plan.max_skip_traces_per_month === -1) return false;
      return usage.skip_traces_count >= plan.max_skip_traces_per_month;
    }

    return false;
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
    hasActiveSubscription: !!subscription && subscription.status === 'active',
    
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
