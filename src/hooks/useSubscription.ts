import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  subscription_id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  period_end: string;
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
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<UsageTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user's active subscription
      const { data: subData, error: subError } = await supabase
        .rpc('get_user_subscription')
        .single();

      if (subError) {
        // User may not have a subscription yet
        if (subError.code === 'PGRST116') {
          setSubscription(null);
          setPlan(null);
          setUsage(null);
          setLoading(false);
          return;
        }
        throw subError;
      }

      setSubscription(subData);

      // Get plan details
      if (subData?.plan_id) {
        const { data: planData, error: planError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', subData.plan_id)
          .single();

        if (planError) throw planError;
        setPlan(planData);
      }

      // Get current usage
      if (subData?.subscription_id) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: usageData, error: usageError } = await supabase
            .from('usage_tracking')
            .select('*')
            .eq('user_id', user.id)
            .eq('subscription_id', subData.subscription_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (usageError && usageError.code !== 'PGRST116') throw usageError;
          setUsage(usageData);
        }
      }
    } catch (err: any) {
      console.error('[useSubscription] Error:', err);
      setError(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  const checkLimit = async (eventType: string, quantity: number = 1): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_usage_limit', {
        _event_type: eventType,
        _quantity: quantity
      });

      if (error) {
        console.error('[useSubscription] Error checking limit:', error);
        return false;
      }

      return data === true;
    } catch (err) {
      console.error('[useSubscription] Error checking limit:', err);
      return false;
    }
  };

  const getUsagePercentage = (type: 'csv_exports' | 'skip_traces') => {
    if (!usage || !plan) return 0;

    const current = type === 'csv_exports'
      ? usage.csv_exports_count
      : usage.skip_traces_used;

    const limit = type === 'csv_exports'
      ? plan.max_csv_exports_per_month
      : plan.skip_trace_credits_per_month;

    if (limit === -1) return 0; // Unlimited
    if (limit === 0) return 100; // Not allowed

    return Math.min(100, Math.round((current / limit) * 100));
  };

  const getRemainingCount = (type: 'csv_exports' | 'skip_traces') => {
    if (!usage || !plan) return 0;

    const current = type === 'csv_exports'
      ? usage.csv_exports_count
      : usage.skip_traces_used;

    const limit = type === 'csv_exports'
      ? plan.max_csv_exports_per_month
      : plan.skip_trace_credits_per_month;

    if (limit === -1) return Infinity; // Unlimited
    return Math.max(0, limit - current);
  };

  const isAtLimit = (type: 'csv_exports' | 'skip_traces') => {
    if (!usage || !plan) return false;

    const current = type === 'csv_exports'
      ? usage.csv_exports_count
      : usage.skip_traces_used;

    const limit = type === 'csv_exports'
      ? plan.max_csv_exports_per_month
      : plan.skip_trace_credits_per_month;

    if (limit === -1) return false; // Unlimited
    return current >= limit;
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
