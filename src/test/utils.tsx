/**
 * Test Utilities
 * Phase 5: Testing helpers for React Query, React Testing Library
 */

import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

// ============================================================================
// REACT QUERY TEST UTILITIES
// ============================================================================

/**
 * Create a test QueryClient with sensible defaults for testing
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry in tests
        gcTime: Infinity, // Don't garbage collect during tests
      },
      mutations: {
        retry: false,
      },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: () => {}, // Silence errors in tests
    },
  });
}

/**
 * Wrapper component with QueryClient and Router
 */
interface TestProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export function TestProviders({ children, queryClient }: TestProvidersProps) {
  const client = queryClient || createTestQueryClient();

  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

/**
 * Custom render with QueryClient and Router
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient,
    ...renderOptions
  }: RenderOptions & { queryClient?: QueryClient } = {}
) {
  const client = queryClient || createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <TestProviders queryClient={client}>{children}</TestProviders>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient: client,
  };
}

// ============================================================================
// SUPABASE MOCK UTILITIES
// ============================================================================

/**
 * Create a mock Supabase client
 */
export function createMockSupabaseClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    })),
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    rpc: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(),
        upload: vi.fn(),
      })),
    },
  };
}

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

/**
 * Create mock property data
 */
export function createMockProperty(overrides = {}) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    address: '123 Main St',
    city: 'Chicago',
    state: 'IL',
    zip: '60601',
    latitude: 41.8781,
    longitude: -87.6298,
    snap_score: 85,
    snap_insight: 'High distress property with multiple violations',
    photo_url: null,
    created_by: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Create mock violation data
 */
export function createMockViolation(overrides = {}) {
  return {
    id: '223e4567-e89b-12d3-a456-426614174001',
    property_id: '123e4567-e89b-12d3-a456-426614174000',
    case_id: 'VIO-2024-001',
    violation_type: 'Structural',
    description: 'Foundation issues',
    status: 'Open',
    opened_date: '2024-01-01',
    last_updated: '2024-01-15',
    days_open: 30,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Create mock subscription plan data
 */
export function createMockSubscriptionPlan(overrides = {}) {
  return {
    id: 'starter',
    name: 'Starter',
    tier: 'starter' as const,
    price_monthly: 39,
    max_csv_exports_per_month: 10,
    skip_trace_credits_per_month: 50,
    stripe_price_id: 'price_starter',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Create mock user subscription data
 */
export function createMockUserSubscription(overrides = {}) {
  return {
    id: '323e4567-e89b-12d3-a456-426614174002',
    user_id: '423e4567-e89b-12d3-a456-426614174003',
    plan_id: 'starter',
    status: 'active' as const,
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    stripe_subscription_id: 'sub_123',
    stripe_customer_id: 'cus_123',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Create mock usage tracking data
 */
export function createMockUsageTracking(overrides = {}) {
  return {
    id: '523e4567-e89b-12d3-a456-426614174004',
    user_id: '423e4567-e89b-12d3-a456-426614174003',
    subscription_id: '323e4567-e89b-12d3-a456-426614174002',
    csv_exports_count: 5,
    skip_traces_used: 20,
    period_start: '2024-01-01T00:00:00Z',
    period_end: '2024-02-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Wait for query to finish loading
 */
export async function waitForLoadingToFinish() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Helper to check if element has loading state
 */
export function expectLoading(element: HTMLElement) {
  expect(element).toBeInTheDocument();
}

/**
 * Helper to check if element is not loading
 */
export function expectNotLoading(element: HTMLElement | null) {
  expect(element).not.toBeInTheDocument();
}

// Re-export everything from testing library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
