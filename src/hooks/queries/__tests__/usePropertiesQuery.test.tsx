/**
 * usePropertiesQuery Hook Tests
 * Phase 6: Component & Integration Testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestProviders, createTestQueryClient, createMockProperty } from '@/test/utils';
import { usePropertiesQuery, useCitiesQuery } from '../usePropertiesQuery';
import * as supabaseClient from '@/integrations/supabase/client';

describe('usePropertiesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch properties successfully', async () => {
    const mockProperties = [
      createMockProperty({ address: '123 Main St' }),
      createMockProperty({ address: '456 Oak Ave' }),
    ];

    const mockSupabaseResponse = {
      data: mockProperties,
      error: null,
      count: 2,
    };

    // Mock the Supabase chain
    const rangeFn = vi.fn(() => Promise.resolve(mockSupabaseResponse));
    const orderFn = vi.fn(() => ({ range: rangeFn }));
    const selectFn = vi.fn(() => ({ order: orderFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: fromFn,
    } as any);

    const { result } = renderHook(() => usePropertiesQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for success
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      data: mockProperties,
      count: 2,
      page: 0,
      pageSize: 25,
      totalPages: 1,
    });

    // Verify Supabase calls
    expect(fromFn).toHaveBeenCalledWith('properties');
    expect(selectFn).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(orderFn).toHaveBeenCalledWith('snap_score', {
      ascending: false,
      nullsFirst: false,
    });
    expect(rangeFn).toHaveBeenCalledWith(0, 24); // page 0, pageSize 25
  });

  it.skip('should handle filters correctly', async () => {
    const mockSupabaseResponse = {
      data: [],
      error: null,
      count: 0,
    };

    let appliedFilters: any = {};

    const rangeFn = vi.fn(() => Promise.resolve(mockSupabaseResponse));
    const orderFn = vi.fn(() => ({ range: rangeFn }));
    const eqFn = vi.fn((field, value) => {
      appliedFilters[field] = value;
      return { eq: eqFn, order: orderFn, or: orFn };
    });
    const orFn = vi.fn(() => ({ order: orderFn }));
    const gteFn = vi.fn((field, value) => {
      appliedFilters[`${field}_gte`] = value;
      return { gte: gteFn, lte: lteFn, eq: eqFn, or: orFn, order: orderFn };
    });
    const lteFn = vi.fn((field, value) => {
      appliedFilters[`${field}_lte`] = value;
      return { gte: gteFn, lte: lteFn, eq: eqFn, or: orFn, order: orderFn };
    });

    const selectFn = vi.fn(() => ({
      order: orderFn,
      eq: eqFn,
      gte: gteFn,
      lte: lteFn,
      or: orFn,
    }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: fromFn,
    } as any);

    renderHook(
      () =>
        usePropertiesQuery({
          city: 'Denver',
          snapScoreMin: 70,
          snapScoreMax: 100,
        }),
      {
        wrapper: ({ children }) => (
          <TestProviders queryClient={createTestQueryClient()}>
            {children}
          </TestProviders>
        ),
      }
    );

    await waitFor(() => {
      expect(eqFn).toHaveBeenCalledWith('city', 'Denver');
      expect(gteFn).toHaveBeenCalledWith('snap_score', 70);
      expect(lteFn).toHaveBeenCalledWith('snap_score', 100);
    });
  });

  it('should handle pagination correctly', async () => {
    const mockSupabaseResponse = {
      data: [],
      error: null,
      count: 100,
    };

    const rangeFn = vi.fn(() => Promise.resolve(mockSupabaseResponse));
    const orderFn = vi.fn(() => ({ range: rangeFn }));
    const selectFn = vi.fn(() => ({ order: orderFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: fromFn,
    } as any);

    const { result } = renderHook(
      () =>
        usePropertiesQuery({
          page: 2,
          pageSize: 10,
        }),
      {
        wrapper: ({ children }) => (
          <TestProviders queryClient={createTestQueryClient()}>
            {children}
          </TestProviders>
        ),
      }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Page 2 with pageSize 10 should request range(20, 29)
    expect(rangeFn).toHaveBeenCalledWith(20, 29);

    // Total pages should be 10 (100 items / 10 per page)
    expect(result.current.data?.totalPages).toBe(10);
  });

  it('should handle errors gracefully', async () => {
    const mockError = new Error('Database error');
    const rangeFn = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: mockError,
      })
    );
    const orderFn = vi.fn(() => ({ range: rangeFn }));
    const selectFn = vi.fn(() => ({ order: orderFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: fromFn,
    } as any);

    const { result } = renderHook(() => usePropertiesQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeTruthy();
  });
});

describe('useCitiesQuery', () => {
  it('should fetch and deduplicate cities', async () => {
    const mockData = [
      { city: 'Denver' },
      { city: 'Boulder' },
      { city: 'Denver' }, // Duplicate
      { city: 'Aurora' },
    ];

    const orderFn = vi.fn(() => Promise.resolve({ data: mockData, error: null }));
    const selectFn = vi.fn(() => ({ order: orderFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: fromFn,
    } as any);

    const { result } = renderHook(() => useCitiesQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should return unique cities, sorted
    expect(result.current.data).toEqual(['Aurora', 'Boulder', 'Denver']);
  });

  it('should filter out null cities', async () => {
    const mockData = [
      { city: 'Denver' },
      { city: null },
      { city: 'Boulder' },
    ];

    const orderFn = vi.fn(() => Promise.resolve({ data: mockData, error: null }));
    const selectFn = vi.fn(() => ({ order: orderFn }));
    const fromFn = vi.fn(() => ({ select: selectFn }));

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: fromFn,
    } as any);

    const { result } = renderHook(() => useCitiesQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(['Boulder', 'Denver']);
    expect(result.current.data).not.toContain(null);
  });
});
