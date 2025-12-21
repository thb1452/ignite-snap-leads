import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

// Stub interfaces - subscription tables don't exist yet
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

// Default free tier plan
const FREE_PLAN: SubscriptionPlan = {
  id: 'free_trial',
  name: 'free_trial',
  display_name: 'Free Trial',
  price_monthly_cents: 0,
  max_jurisdictions: 1,
  max_monthly_records: 100,
  max_csv_exports_per_month: 3,
  min_snap_score: 0,
  max_snap_score: 100,
  skip_trace_credits_per_month: 10,
  can_access_api: false,
  can_bulk_sms: false,
  can_bulk_mail: false,
  features: ['Basic property search', 'Limited exports', 'Email support'],
};

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(FREE_PLAN);
  const [usage, setUsage] = useState<UsageTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Subscription tables don't exist yet - just use free tier defaults
    if (user) {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      
      setSubscription({
        id: 'stub',
        subscription_id: 'stub',
        plan_id: 'free_trial',
        plan_name: 'Free Trial',
        status: 'active',
        period_end: periodEnd,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      });
      
      setUsage({
        csv_exports_count: 0,
        records_accessed_count: 0,
        skip_traces_used: 0,
        api_calls_count: 0,
        bulk_sms_sent: 0,
        bulk_mail_sent: 0,
        period_start: periodStart,
        period_end: periodEnd,
      });
    }
  }, [user?.id]);

  const checkLimit = async (_eventType: string, _quantity: number = 1): Promise<boolean> => {
    // No limits enforced in stub mode
    return true;
  };

  const getUsagePercentage = (type: 'csv_exports' | 'skip_traces'): number => {
    if (!plan || !usage) return 0;

    if (type === 'csv_exports') {
      if (plan.max_csv_exports_per_month === -1) return 0;
      return (usage.csv_exports_count / plan.max_csv_exports_per_month) * 100;
    } else if (type === 'skip_traces') {
      return (usage.skip_traces_used / plan.skip_trace_credits_per_month) * 100;
    }

    return 0;
  };

  const getRemainingCount = (type: 'csv_exports' | 'skip_traces'): number => {
    if (!plan || !usage) return 0;

    if (type === 'csv_exports') {
      if (plan.max_csv_exports_per_month === -1) return Infinity;
      return Math.max(0, plan.max_csv_exports_per_month - usage.csv_exports_count);
    } else if (type === 'skip_traces') {
      return Math.max(0, plan.skip_trace_credits_per_month - usage.skip_traces_used);
    }

    return 0;
  };

  const isAtLimit = (type: 'csv_exports' | 'skip_traces'): boolean => {
    if (!plan || !usage) return false;

    if (type === 'csv_exports') {
      if (plan.max_csv_exports_per_month === -1) return false;
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
    refetch: () => Promise.resolve(),
  };
}
