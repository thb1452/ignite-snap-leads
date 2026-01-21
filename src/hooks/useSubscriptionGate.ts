import { useState, useCallback } from "react";
import { useSubscription, LimitCheckResult } from "./useSubscription";
import { useToast } from "./use-toast";
import type { UsageType, FeatureType } from "@/types/subscription";

interface UseSubscriptionGateOptions {
  onLimitExceeded?: (result: LimitCheckResult) => void;
  showToast?: boolean;
}

/**
 * Hook for gating actions behind subscription limits
 * Use this before performing exports or other limited actions
 */
export function useSubscriptionGate(options: UseSubscriptionGateOptions = {}) {
  const { showToast = true, onLimitExceeded } = options;
  const { checkLimit, trackUsage, hasActiveSubscription, subscription, plan, usage } = useSubscription();
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState(false);

  /**
   * Check if action is allowed, show appropriate feedback
   * Returns true if allowed, false if blocked
   */
  const canPerformAction = useCallback(async (
    usageType: UsageType,
    amount: number = 1
  ): Promise<boolean> => {
    setIsChecking(true);
    
    try {
      // First check if user has an active subscription
      if (!hasActiveSubscription) {
        if (showToast) {
          toast({
            variant: "destructive",
            title: "Subscription Required",
            description: "Please subscribe to a plan to access this feature.",
          });
        }
        return false;
      }

      const result = await checkLimit(usageType, amount);
      
      if (!result.allowed) {
        if (showToast) {
          toast({
            variant: "destructive",
            title: "Limit Reached",
            description: result.message || `You've reached your ${usageType} limit.`,
          });
        }
        
        onLimitExceeded?.(result);
        return false;
      }
      
      return true;
    } finally {
      setIsChecking(false);
    }
  }, [hasActiveSubscription, checkLimit, showToast, toast, onLimitExceeded]);

  /**
   * Perform action with automatic tracking
   * Checks limit, executes action, tracks usage
   */
  const performGatedAction = useCallback(async <T>(
    usageType: UsageType,
    action: () => Promise<T>,
    amount: number = 1
  ): Promise<{ success: boolean; result?: T; error?: string }> => {
    const allowed = await canPerformAction(usageType, amount);
    
    if (!allowed) {
      return { success: false, error: 'Action not allowed due to subscription limits' };
    }
    
    try {
      const result = await action();
      
      // Track the usage after successful action
      await trackUsage(usageType, amount);
      
      return { success: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }, [canPerformAction, trackUsage]);

  /**
   * Get remaining count for a usage type
   * Returns null for unlimited plans
   */
  const getRemaining = useCallback((usageType: UsageType): number | null => {
    if (!plan || !usage) return 0;
    
    if (usageType === 'exports') {
      if (plan.max_monthly_exports === -1) return null;
      return Math.max(0, plan.max_monthly_exports - usage.exports_count);
    }
    
    return 0;
  }, [plan, usage]);

  /**
   * Check if feature is available on current plan
   * Features are booleans, not counters
   */
  const hasFeature = useCallback((feature: FeatureType): boolean => {
    if (!plan) return false;
    
    switch (feature) {
      case 'advanced_filters':
        return plan.has_advanced_filters;
      case 'violation_filtering':
        return plan.has_violation_filtering;
      case 'rolling_intelligence':
        return plan.has_rolling_intelligence;
      case 'escalation_alerts':
        return plan.has_escalation_alerts;
      case 'api_access':
        return plan.has_api_access;
      default:
        return false;
    }
  }, [plan]);

  return {
    isChecking,
    hasActiveSubscription,
    subscription,
    plan,
    usage,
    
    // Actions
    canPerformAction,
    performGatedAction,
    trackUsage,
    
    // Helpers
    getRemaining,
    hasFeature,
  };
}
