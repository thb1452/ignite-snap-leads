import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/externalClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export interface TrialStatus {
  isOnTrial: boolean;
  hasTrialExpired: boolean;
  hasActiveSubscription: boolean;
  trialDaysRemaining: number;
  trialExportsUsed: number;
  trialExportsRemaining: number;
  trialExportsLimit: number;
  trialTier: string | null;
  trialEndsAt: string | null;
  trialStartedAt: string | null;
  subscriptionStatus: string | null;
  canExport: boolean;
  planId: string | null;
}

async function fetchTrialStatus(userId: string): Promise<TrialStatus> {
  const { data, error } = await supabase.rpc('fn_get_trial_status' as any, {
    p_user_id: userId,
  }) as { data: any; error: any };

  if (error) {
    console.error('Error fetching trial status:', error);
    return {
      isOnTrial: false,
      hasTrialExpired: false,
      hasActiveSubscription: false,
      trialDaysRemaining: 0,
      trialExportsUsed: 0,
      trialExportsRemaining: 0,
      trialExportsLimit: 50,
      trialTier: null,
      trialEndsAt: null,
      trialStartedAt: null,
      subscriptionStatus: null,
      canExport: false,
      planId: null,
    };
  }

  return {
    isOnTrial: data?.is_on_trial ?? false,
    hasTrialExpired: data?.has_trial_expired ?? false,
    hasActiveSubscription: data?.has_active_subscription ?? false,
    trialDaysRemaining: Math.ceil(data?.trial_days_remaining ?? 0),
    trialExportsUsed: data?.trial_exports_used ?? 0,
    trialExportsRemaining: data?.trial_exports_remaining ?? 0,
    trialExportsLimit: data?.trial_exports_limit ?? 50,
    trialTier: data?.trial_tier ?? null,
    trialEndsAt: data?.trial_ends_at ?? null,
    trialStartedAt: data?.trial_started_at ?? null,
    subscriptionStatus: data?.subscription_status ?? null,
    canExport: data?.can_export ?? false,
    planId: data?.plan_id ?? null,
  };
}

export function useTrialStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: trial,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['trial-status', user?.id],
    queryFn: () => fetchTrialStatus(user!.id),
    enabled: !!user?.id,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // refetch every minute to keep trial countdown fresh
  });

  const startTrial = useCallback(async (tier: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase.rpc('fn_start_trial' as any, {
      p_user_id: user.id,
      p_trial_tier: tier,
    }) as { data: any; error: any };

    if (error) {
      console.error('Error starting trial:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to start trial' };
    }

    // Invalidate all related queries
    queryClient.invalidateQueries({ queryKey: ['trial-status'] });
    queryClient.invalidateQueries({ queryKey: ['subscription'] });

    return { success: true };
  }, [user?.id, queryClient]);

  const incrementTrialExports = useCallback(async (count: number = 1): Promise<{ success: boolean; remaining?: number; error?: string }> => {
    if (!user?.id) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase.rpc('fn_increment_trial_exports' as any, {
      p_user_id: user.id,
      p_count: count,
    }) as { data: any; error: any };

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error };
    }

    // Refresh trial status
    queryClient.invalidateQueries({ queryKey: ['trial-status'] });

    return { success: true, remaining: data.remaining };
  }, [user?.id, queryClient]);

  return {
    ...(trial ?? {
      isOnTrial: false,
      hasTrialExpired: false,
      hasActiveSubscription: false,
      trialDaysRemaining: 0,
      trialExportsUsed: 0,
      trialExportsRemaining: 0,
      trialExportsLimit: 50,
      trialTier: null,
      trialEndsAt: null,
      trialStartedAt: null,
      subscriptionStatus: null,
      canExport: false,
      planId: null,
    }),
    loading: isLoading,
    startTrial,
    incrementTrialExports,
    refetch,
  };
}
