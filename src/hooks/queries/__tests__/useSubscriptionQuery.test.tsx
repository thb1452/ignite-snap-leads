/**
 * useSubscriptionQuery Hook Tests
 * Phase 6: Component & Integration Testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  TestProviders,
  createTestQueryClient,
  createMockSubscriptionPlan,
  createMockUserSubscription,
  createMockUsageTracking,
} from '@/test/utils';
import {
  useSubscriptionPlansQuery,
  useUserSubscriptionQuery,
  getUsagePercentage,
  getRemainingCount,
  isAtLimit,
} from '../useSubscriptionQuery';
import * as supabaseClient from '@/integrations/supabase/client';

describe('useSubscriptionPlansQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch active subscription plans', async () => {
    const mockPlans = [
      createMockSubscriptionPlan({ name: 'Basic', price_monthly: 29 }),
      createMockSubscriptionPlan({ name: 'Pro', price_monthly: 99 }),
    ];

    const orderFn = vi.fn(() => Promise.resolve({ data: mockPlans, error: null }));
    const eqFn = vi.fn(() => ({ order: orderFn }));
    const selectFn = vi.fn(() => ({ eq: eqFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: fromFn,
    } as any);

    const { result } = renderHook(() => useSubscriptionPlansQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockPlans);
    expect(eqFn).toHaveBeenCalledWith('is_active', true);
    expect(orderFn).toHaveBeenCalledWith('price_monthly');
  });
});

describe('useUserSubscriptionQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null data when no user is authenticated', async () => {
    // Mock getUser to return no user
    const getUserFn = vi.fn(() => Promise.resolve({ data: { user: null } }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      auth: {
        getUser: getUserFn,
      },
    } as any);

    const { result } = renderHook(() => useUserSubscriptionQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      subscription: null,
      plan: null,
      usage: null,
    });
  });

  it('should fetch complete subscription data for authenticated user', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSubscription = createMockUserSubscription({ user_id: mockUser.id });
    const mockPlan = createMockSubscriptionPlan({ id: mockSubscription.plan_id });
    const mockUsage = createMockUsageTracking({
      user_id: mockUser.id,
      subscription_id: mockSubscription.id,
    });

    // Mock getUser
    const getUserFn = vi.fn(() => Promise.resolve({ data: { user: mockUser } }));

    // Mock subscription query
    const subMaybeSingleFn = vi.fn(() => Promise.resolve({ data: mockSubscription }));
    const subLimitFn = vi.fn(() => ({ maybeSingle: subMaybeSingleFn }));
    const subOrderFn = vi.fn(() => ({ limit: subLimitFn }));
    const subEqFn = vi.fn(() => ({ eq: subEqFn, order: subOrderFn }));
    const subSelectFn = vi.fn(() => ({ eq: subEqFn }));

    // Mock plan query
    const planSingleFn = vi.fn(() => Promise.resolve({ data: mockPlan }));
    const planEqFn = vi.fn(() => ({ single: planSingleFn }));
    const planSelectFn = vi.fn(() => ({ eq: planEqFn }));

    // Mock usage query
    const usageMaybeSingleFn = vi.fn(() => Promise.resolve({ data: mockUsage }));
    const usageLteFn = vi.fn(() => ({ maybeSingle: usageMaybeSingleFn }));
    const usageGteFn = vi.fn(() => ({ lte: usageLteFn }));
    const usageEqFn = vi.fn(() => ({ eq: usageEqFn, gte: usageGteFn }));
    const usageSelectFn = vi.fn(() => ({ eq: usageEqFn }));

    let callCount = 0;
    const fromFn = vi.fn((table: string) => {
      if (table === 'user_subscriptions') {
        return { select: subSelectFn };
      } else if (table === 'subscription_plans') {
        return { select: planSelectFn };
      } else if (table === 'usage_tracking') {
        return { select: usageSelectFn };
      }
    });

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      auth: { getUser: getUserFn },
      from: fromFn,
    } as any);

    const { result } = renderHook(() => useUserSubscriptionQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      subscription: mockSubscription,
      plan: mockPlan,
      usage: mockUsage,
    });
  });
});

describe('Helper Functions', () => {
  describe('getUsagePercentage', () => {
    it('should return 0 when usage or plan is null', () => {
      expect(getUsagePercentage(null, null, 'csv_export')).toBe(0);
      expect(getUsagePercentage(createMockUsageTracking(), null, 'csv_export')).toBe(0);
    });

    it('should return 0 for unlimited plans', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 50 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: -1 });

      expect(getUsagePercentage(usage, plan, 'csv_export')).toBe(0);
    });

    it('should calculate percentage correctly for csv exports', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 5 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 10 });

      expect(getUsagePercentage(usage, plan, 'csv_export')).toBe(50);
    });

    it('should calculate percentage correctly for skip traces', () => {
      const usage = createMockUsageTracking({ skip_traces_used: 75 });
      const plan = createMockSubscriptionPlan({ skip_trace_credits_per_month: 100 });

      expect(getUsagePercentage(usage, plan, 'skip_trace')).toBe(75);
    });

    it('should cap percentage at 100', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 15 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 10 });

      expect(getUsagePercentage(usage, plan, 'csv_export')).toBe(100);
    });

    it('should return 100 when limit is 0', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 0 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 0 });

      expect(getUsagePercentage(usage, plan, 'csv_export')).toBe(100);
    });
  });

  describe('getRemainingCount', () => {
    it('should return 0 when plan is null', () => {
      expect(getRemainingCount(null, null, 'csv_export')).toBe(0);
    });

    it('should return "unlimited" for unlimited plans', () => {
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: -1 });

      expect(getRemainingCount(null, plan, 'csv_export')).toBe('unlimited');
    });

    it('should calculate remaining count correctly', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 3 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 10 });

      expect(getRemainingCount(usage, plan, 'csv_export')).toBe(7);
    });

    it('should return full limit when usage is null', () => {
      const plan = createMockSubscriptionPlan({ skip_trace_credits_per_month: 100 });

      expect(getRemainingCount(null, plan, 'skip_trace')).toBe(100);
    });

    it('should not return negative values', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 15 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 10 });

      expect(getRemainingCount(usage, plan, 'csv_export')).toBe(0);
    });
  });

  describe('isAtLimit', () => {
    it('should return false for unlimited plans', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 1000 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: -1 });

      expect(isAtLimit(usage, plan, 'csv_export')).toBe(false);
    });

    it('should return true when at or over limit', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 10 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 10 });

      expect(isAtLimit(usage, plan, 'csv_export')).toBe(true);
    });

    it('should return false when under limit', () => {
      const usage = createMockUsageTracking({ csv_exports_count: 5 });
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 10 });

      expect(isAtLimit(usage, plan, 'csv_export')).toBe(false);
    });

    it('should handle null usage as 0 usage', () => {
      const plan = createMockSubscriptionPlan({ max_csv_exports_per_month: 10 });

      expect(isAtLimit(null, plan, 'csv_export')).toBe(false);
    });
  });
});
