import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  price_monthly_cents: number;
  max_jurisdictions: number;
  max_monthly_records: number;
  max_csv_exports_per_month: number;
  min_snap_score: number;
  max_snap_score: number;
  skip_trace_credits_per_month: number;
  can_access_api: boolean;
  can_bulk_sms: boolean;
  can_bulk_mail: boolean;
  features: string[];
}

interface UserSubscription {
  id: string;
  subscription_id: string;
  stripe_subscription_id?: string;
  plan_id: string;
  plan_name: string;
  status: string;
  period_end: string;
  current_period_start: string;
  current_period_end: string;
}

interface UsageTracking {
  csv_exports_count: number;
  records_accessed_count: number;
  skip_traces_used: number;
  api_calls_count: number;
  bulk_sms_sent: number;
  bulk_mail_sent: number;
  period_start: string;
  period_end: string;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<UsageTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get user's active subscription using the helper function
      const { data: subData, error: subError } = await supabase.rpc('get_user_subscription');

      if (subError) {
        console.error('[useSubscription] Error fetching subscription:', subError);
        throw subError;
      }

      if (!subData || subData.length === 0) {
        // No active subscription
        setSubscription(null);
        setPlan(null);
        setUsage(null);
        return;
      }

      const userSub = subData[0];

      // Fetch full subscription details
      const { data: fullSubData, error: fullSubError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('id', userSub.subscription_id)
        .single();

      if (fullSubError) throw fullSubError;

      setSubscription({
        id: fullSubData.id,
        subscription_id: fullSubData.id,
        stripe_subscription_id: fullSubData.stripe_subscription_id,
        plan_id: fullSubData.plan_id,
        plan_name: userSub.plan_name,
        status: fullSubData.status,
        period_end: fullSubData.current_period_end,
        current_period_start: fullSubData.current_period_start,
        current_period_end: fullSubData.current_period_end,
      });

      // Fetch plan details
      const { data: planData, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', fullSubData.plan_id)
        .single();

      if (planError) throw planError;
      setPlan(planData);

      // Fetch usage tracking
      const { data: usageData, error: usageError } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', user.id)
        .eq('period_start', fullSubData.current_period_start)
        .eq('period_end', fullSubData.current_period_end)
        .maybeSingle();

      if (usageError) throw usageError;
      setUsage(usageData || {
        csv_exports_count: 0,
        records_accessed_count: 0,
        skip_traces_used: 0,
        api_calls_count: 0,
        bulk_sms_sent: 0,
        bulk_mail_sent: 0,
        period_start: fullSubData.current_period_start,
        period_end: fullSubData.current_period_end,
      });

    } catch (err: any) {
      console.error('[useSubscription] Error:', err);
      setError(err.message || 'Failed to fetch subscription');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [user?.id]);

  const checkLimit = async (eventType: string, quantity: number = 1): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('check_usage_limit', {
        _event_type: eventType,
        _quantity: quantity,
      });

      if (error) {
        console.error('[useSubscription] Error checking limit:', error);
        return false;
      }

      return data || false;
    } catch (err) {
      console.error('[useSubscription] Error checking limit:', err);
      return false;
    }
  };

  const getUsagePercentage = (type: 'csv_exports' | 'skip_traces'): number => {
    if (!plan || !usage) return 0;

    if (type === 'csv_exports') {
      if (plan.max_csv_exports_per_month === -1) return 0; // Unlimited
      return (usage.csv_exports_count / plan.max_csv_exports_per_month) * 100;
    } else if (type === 'skip_traces') {
      return (usage.skip_traces_used / plan.skip_trace_credits_per_month) * 100;
    }

    return 0;
  };

  const getRemainingCount = (type: 'csv_exports' | 'skip_traces'): number => {
    if (!plan || !usage) return 0;

    if (type === 'csv_exports') {
      if (plan.max_csv_exports_per_month === -1) return Infinity; // Unlimited
      return Math.max(0, plan.max_csv_exports_per_month - usage.csv_exports_count);
    } else if (type === 'skip_traces') {
      return Math.max(0, plan.skip_trace_credits_per_month - usage.skip_traces_used);
    }

    return 0;
  };

  const isAtLimit = (type: 'csv_exports' | 'skip_traces'): boolean => {
    if (!plan || !usage) return false;

    if (type === 'csv_exports') {
      if (plan.max_csv_exports_per_month === -1) return false; // Unlimited
      return usage.csv_exports_count >= plan.max_csv_exports_per_month;
    } else if (type === 'skip_traces') {
      return usage.skip_traces_used >= plan.skip_trace_credits_per_month;
    }

    return false;
  };

  return {
    subscription,
    plan,
    usage,
    loading,
    error,
    checkLimit,
    getUsagePercentage,
    getRemainingCount,
    isAtLimit,
    refetch: fetchSubscription,
  };
}
