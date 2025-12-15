import { useState, useEffect } from "react";

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
  stripe_subscription_id?: string;
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

// Stubbed hook - subscription tables don't exist yet
export function useSubscription() {
  const [subscription] = useState<UserSubscription | null>(null);
  const [plan] = useState<SubscriptionPlan | null>(null);
  const [usage] = useState<UsageTracking | null>(null);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  const fetchSubscription = async () => {
    // TODO: Implement when subscription tables are created
    console.log('[useSubscription] Subscription tables not yet implemented');
  };

  useEffect(() => {
    // No-op for now
  }, []);

  const checkLimit = async (_eventType: string, _quantity: number = 1): Promise<boolean> => {
    // Always return true (no limits) until subscription system is implemented
    return true;
  };

  const getUsagePercentage = (_type: 'csv_exports' | 'skip_traces') => {
    return 0;
  };

  const getRemainingCount = (_type: 'csv_exports' | 'skip_traces') => {
    return Infinity;
  };

  const isAtLimit = (_type: 'csv_exports' | 'skip_traces') => {
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
