/**
 * ProtectedRoute Component Tests
 * Phase 6: Component & Integration Testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { ProtectedRoute } from '../ProtectedRoute';
import * as useAuthModule from '@/hooks/use-auth';

// Mock the useAuth hook
vi.mock('@/hooks/use-auth');

// Mock AppLayout to simplify testing
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

// Mock AuthForm
vi.mock('../AuthForm', () => ({
  AuthForm: () => <div data-testid="auth-form">Please sign in</div>,
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state when auth is loading', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: null,
      roles: [],
      loading: true,
      hasRole: () => false,
      isAdmin: false,
      isVA: false,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    });

    const { container } = renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Should show loading spinner (Loader2 with animate-spin class)
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should show auth form when user is not authenticated', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: null,
      roles: [],
      loading: false,
      hasRole: () => false,
      isAdmin: false,
      isVA: false,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Should show auth form instead of protected content
    expect(screen.getByTestId('auth-form')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children in AppLayout when user is authenticated', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' } as any,
      roles: ['user'],
      loading: false,
      hasRole: (role) => role === 'user',
      isAdmin: false,
      isVA: false,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Should show protected content wrapped in AppLayout
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-form')).not.toBeInTheDocument();
  });

  it('should handle admin users', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-123', email: 'admin@example.com' } as any,
      roles: ['admin'],
      loading: false,
      hasRole: (role) => role === 'admin',
      isAdmin: true,
      isVA: false,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Admin Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Admin Protected Content')).toBeInTheDocument();
  });
});
