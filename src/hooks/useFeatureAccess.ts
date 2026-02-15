import { useCallback } from "react";
import { useSubscription } from "./useSubscription";
import { useTrialStatus } from "./useTrialStatus";
import type { FeatureType } from "@/types/subscription";

/**
 * Feature access matrix by trial tier:
 *   Starter trial:      no advanced features
 *   Professional trial:  advanced_filters, violation_filtering, rolling_intelligence
 *   Enterprise trial:    all features
 */
const TRIAL_TIER_FEATURES: Record<string, FeatureType[]> = {
  starter: [],
  professional: ['advanced_filters', 'violation_filtering', 'rolling_intelligence'],
  enterprise: ['advanced_filters', 'violation_filtering', 'rolling_intelligence', 'escalation_alerts', 'api_access'],
};

/**
 * Centralized hook for checking feature access based on subscription plan flags.
 *
 * Checks both paid subscriptions AND trial tiers for feature access.
 * Trial users get feature access based on their trial_tier plan mapping.
 */
export function useFeatureAccess() {
  const { subscription, plan, loading: subLoading } = useSubscription();
  const { isOnTrial, trialTier, loading: trialLoading } = useTrialStatus();

  const hasFeature = useCallback(
    (feature: FeatureType): boolean => {
      // First check paid subscription
      if (subscription) {
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
      }

      // Check trial tier features
      if (isOnTrial && trialTier) {
        const tierFeatures = TRIAL_TIER_FEATURES[trialTier] || [];
        return tierFeatures.includes(feature);
      }

      return false;
    },
    [subscription, isOnTrial, trialTier]
  );

  return {
    /** Check whether the current plan includes a specific feature */
    hasFeature,
    /** Current plan tier name (starter / professional / enterprise) or null */
    planName: subscription?.plan_name ?? trialTier ?? null,
    /** True while subscription data is still loading */
    loading: subLoading || trialLoading,
  };
}
