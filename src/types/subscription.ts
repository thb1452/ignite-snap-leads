/**
 * Canonical subscription types - the single source of truth
 * 
 * RULES:
 * - UsageType = counters (exports, api_calls)
 * - FeatureType = booleans (advanced_filters, api_access, etc.)
 * - Never mix them
 */

// Usage types are things we count and limit
export type UsageType = 'exports' | 'api_calls';

// Feature types are plan capabilities (boolean flags)
export type FeatureType = 
  | 'advanced_filters'
  | 'violation_filtering'
  | 'rolling_intelligence'
  | 'escalation_alerts'
  | 'api_access';

// Limit types that can appear in upgrade prompts (usage + feature combinations)
export type LimitType = UsageType | FeatureType;

// Plan tier names (match database)
export type PlanTierName = 'starter' | 'professional' | 'enterprise';

export interface SubscriptionPlan {
  id: string;
  name: PlanTierName;
  display_name: string;
  description: string | null;
  price_monthly_cents: number;
  price_annual_cents: number;
  max_monthly_exports: number;
  max_counties: number;
  max_user_seats: number;
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
  plan_name: PlanTierName;
  display_name: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  max_monthly_exports: number;
  max_counties: number;
  max_user_seats: number;
  has_advanced_filters: boolean;
  has_violation_filtering: boolean;
  has_rolling_intelligence: boolean;
  has_escalation_alerts: boolean;
  has_api_access: boolean;
  stripe_subscription_id: string | null;
}

export interface UsageTracking {
  exports_count: number;
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
