/**
 * React Query hooks for subscriptions
 * Phase 4: Performance - Centralized subscription data with caching
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];
type UserSubscription = Database['public']['Tables']['user_subscriptions']['Row'];
type UsageTracking = Database['public']['Tables']['usage_tracking']['Row'];

// ============================================================================
// QUERY KEYS
// ============================================================================

export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  plans: () => [...subscriptionKeys.all, 'plans'] as const,
  userSubscription: (userId: string) => [...subscriptionKeys.all, 'user', userId] as const,
  usage: (userId: string) => [...subscriptionKeys.all, 'usage', userId] as const,
};

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionData {
  subscription: UserSubscription | null;
  plan: SubscriptionPlan | null;
  usage: UsageTracking | null;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Fetch all subscription plans
 */
export function useSubscriptionPlansQuery() {
  return useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly');

      if (error) throw error;
      return data || [];
    },
    staleTime: 600000, // 10 minutes - plans don't change often
    gcTime: 3600000, // 1 hour
  });
}

/**
 * Fetch current user's subscription with plan and usage
 */
export function useUserSubscriptionQuery() {
  return useQuery({
    queryKey: ['user-subscription'],
    queryFn: async (): Promise<SubscriptionData> => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          subscription: null,
          plan: null,
          usage: null,
        };
      }

      // Get active subscription
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let plan: SubscriptionPlan | null = null;
      let usage: UsageTracking | null = null;

      if (subscription) {
        // Get plan details
        const { data: planData } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', subscription.plan_id)
          .single();

        plan = planData;

        // Get current usage
        const { data: usageData } = await supabase
          .from('usage_tracking')
          .select('*')
          .eq('user_id', user.id)
          .eq('subscription_id', subscription.id)
          .gte('period_start', subscription.current_period_start)
          .lte('period_end', subscription.current_period_end)
          .maybeSingle();

        usage = usageData;
      }

      return {
        subscription,
        plan,
        usage,
      };
    },
    staleTime: 30000, // 30 seconds - usage changes frequently
    gcTime: 300000, // 5 minutes
  });
}

/**
 * Check if user can perform an action based on usage limits
 */
export function useCheckUsageLimitQuery(eventType: 'csv_export' | 'skip_trace', quantity: number = 1) {
  return useQuery({
    queryKey: [...subscriptionKeys.all, 'check-limit', eventType, quantity],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('check_usage_limit', {
        _event_type: eventType,
        _quantity: quantity,
      });

      if (error) {
        console.error('Error checking usage limit:', error);
        return false;
      }

      return data === true;
    },
    staleTime: 10000, // 10 seconds
    gcTime: 60000, // 1 minute
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Record usage event mutation
 */
export function useRecordUsageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventType,
      resourceType,
      resourceId,
      quantity,
      metadata,
    }: {
      eventType: string;
      resourceType: string;
      resourceId?: string | null;
      quantity?: number;
      metadata?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc('record_usage_event', {
        _event_type: eventType,
        _resource_type: resourceType,
        _resource_id: resourceId || null,
        _quantity: quantity || 1,
        _metadata: metadata || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate usage queries to refresh counts
      queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}

/**
 * Cancel subscription mutation
 */
export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .update({ status: 'canceled' })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-subscription'] });
    },
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get usage percentage for a specific usage type
 */
export function getUsagePercentage(
  usage: UsageTracking | null,
  plan: SubscriptionPlan | null,
  type: 'csv_export' | 'skip_trace'
): number {
  if (!usage || !plan) return 0;

  const used =
    type === 'csv_export' ? usage.csv_exports_count : usage.skip_traces_used;
  const limit =
    type === 'csv_export'
      ? plan.max_csv_exports_per_month
      : plan.skip_trace_credits_per_month;

  if (limit === -1) return 0; // Unlimited
  if (limit === 0) return 100;

  return Math.min((used / limit) * 100, 100);
}

/**
 * Get remaining count for a specific usage type
 */
export function getRemainingCount(
  usage: UsageTracking | null,
  plan: SubscriptionPlan | null,
  type: 'csv_export' | 'skip_trace'
): number | 'unlimited' {
  if (!plan) return 0;

  const limit =
    type === 'csv_export'
      ? plan.max_csv_exports_per_month
      : plan.skip_trace_credits_per_month;

  if (limit === -1) return 'unlimited';

  const used = usage
    ? type === 'csv_export'
      ? usage.csv_exports_count
      : usage.skip_traces_used
    : 0;

  return Math.max(limit - used, 0);
}

/**
 * Check if user is at usage limit
 */
export function isAtLimit(
  usage: UsageTracking | null,
  plan: SubscriptionPlan | null,
  type: 'csv_export' | 'skip_trace'
): boolean {
  const remaining = getRemainingCount(usage, plan, type);
  return remaining !== 'unlimited' && remaining <= 0;
}
