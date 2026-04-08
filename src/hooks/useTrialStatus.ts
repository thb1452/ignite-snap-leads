import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/externalClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { withTimeout } from "@/lib/withTimeout";

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

interface TrialStatusRow {
  is_on_trial?: boolean;
  has_trial_expired?: boolean;
  has_active_subscription?: boolean;
  trial_days_remaining?: number;
  trial_exports_used?: number;
  trial_exports_remaining?: number;
  trial_exports_limit?: number;
  trial_tier?: string | null;
  trial_ends_at?: string | null;
  trial_started_at?: string | null;
  subscription_status?: string | null;
  can_export?: boolean;
  plan_id?: string | null;
}

const FALLBACK_TRIAL_STATUS: TrialStatus = {
  isOnTrial: false,
  hasTrialExpired: false,
  hasActiveSubscription: false,
  trialDaysRemaining: 0,
  trialExportsUsed: 0,
  trialExportsRemaining: 0,
  trialExportsLimit: 500,
  trialTier: null,
  trialEndsAt: null,
  trialStartedAt: null,
  subscriptionStatus: null,
  canExport: false,
  planId: null,
};

async function fetchTrialStatus(userId: string): Promise<TrialStatus> {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('fn_get_trial_status', { p_user_id: userId }),
      8000,
      'Trial status lookup timed out',
    );

    if (error) {
      console.error('Error fetching trial status:', error);
      return FALLBACK_TRIAL_STATUS;
    }

    const row = data as unknown as TrialStatusRow | null;

    return {
      isOnTrial: row?.is_on_trial ?? false,
      hasTrialExpired: row?.has_trial_expired ?? false,
      hasActiveSubscription: row?.has_active_subscription ?? false,
      trialDaysRemaining: Math.ceil(row?.trial_days_remaining ?? 0),
      trialExportsUsed: row?.trial_exports_used ?? 0,
      trialExportsRemaining: row?.trial_exports_remaining ?? 0,
      trialExportsLimit: row?.trial_exports_limit ?? 500,
      trialTier: row?.trial_tier ?? null,
      trialEndsAt: row?.trial_ends_at ?? null,
      trialStartedAt: row?.trial_started_at ?? null,
      subscriptionStatus: row?.subscription_status ?? null,
      canExport: row?.can_export ?? false,
      planId: row?.plan_id ?? null,
    };
  } catch (error) {
    console.error('Trial status fetch failed:', error);
    return FALLBACK_TRIAL_STATUS;
  }
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
    staleTime: 10 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
    retry: 0,
  });

  interface StartTrialResult {
    success: boolean;
    error?: string;
    subscription_id?: string;
    trial_ends_at?: string;
    trial_tier?: string | null;
  }

  const startTrial = useCallback(async (tier: string): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase.rpc('fn_start_trial', {
      p_user_id: user.id,
      p_trial_tier: tier,
    });

    if (error) {
      console.error('Error starting trial:', error);
      return { success: false, error: error.message };
    }

    const result = data as unknown as StartTrialResult | null;

    if (!result?.success) {
      return { success: false, error: result?.error || 'Failed to start trial' };
    }

    queryClient.invalidateQueries({ queryKey: ['trial-status'] });
    queryClient.invalidateQueries({ queryKey: ['subscription'] });

    return { success: true };
  }, [user?.id, queryClient]);

  interface IncrementTrialExportsResult {
    success: boolean;
    error?: string;
    remaining?: number;
    used?: number;
    limit?: number;
  }

  const incrementTrialExports = useCallback(async (count: number = 1): Promise<{ success: boolean; remaining?: number; error?: string }> => {
    if (!user?.id) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase.rpc('fn_increment_trial_exports', {
      p_user_id: user.id,
      p_count: count,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as unknown as IncrementTrialExportsResult | null;

    if (!result?.success) {
      return { success: false, error: result?.error };
    }

    queryClient.invalidateQueries({ queryKey: ['trial-status'] });

    return { success: true, remaining: result.remaining };
  }, [user?.id, queryClient]);

  return {
    ...(trial ?? FALLBACK_TRIAL_STATUS),
    loading: isLoading,
    startTrial,
    incrementTrialExports,
    refetch,
  };
}
