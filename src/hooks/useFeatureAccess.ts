import { useCallback } from "react";
import { useSubscription } from "./useSubscription";
import type { FeatureType } from "@/types/subscription";

/**
 * Centralized hook for checking feature access based on subscription plan flags.
 *
 * The subscription_plans table stores boolean flags (has_advanced_filters,
 * has_violation_filtering, etc.) per plan tier. This hook reads them from
 * the user's active subscription and provides a simple API for components.
 *
 * Plan matrix (from DB seed data):
 *   Starter:      all features false
 *   Professional: advanced_filters, violation_filtering, rolling_intelligence
 *   Enterprise:   all features true
 */
export function useFeatureAccess() {
  const { subscription, plan, loading } = useSubscription();

  const hasFeature = useCallback(
    (feature: FeatureType): boolean => {
      if (!subscription) return false;

      switch (feature) {
        case "advanced_filters":
          return subscription.has_advanced_filters;
        case "violation_filtering":
          return subscription.has_violation_filtering;
        case "rolling_intelligence":
          return subscription.has_rolling_intelligence;
        case "escalation_alerts":
          return subscription.has_escalation_alerts;
        case "api_access":
          return subscription.has_api_access;
        default:
          return false;
      }
    },
    [subscription]
  );

  return {
    /** Check whether the current plan includes a specific feature */
    hasFeature,
    /** Current plan tier name (starter / professional / enterprise) or null */
    planName: subscription?.plan_name ?? null,
    /** True while subscription data is still loading */
    loading,
  };
}
