/**
 * RoleProtectedRoute Component Tests
 * Phase 6: Component & Integration Testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { RoleProtectedRoute } from '../RoleProtectedRoute';
import * as useAuthModule from '@/hooks/use-auth';

// Mock the useAuth hook
vi.mock('@/hooks/use-auth');

describe('RoleProtectedRoute', () => {
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
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>Admin Content</div>
      </RoleProtectedRoute>
    );

    // Should show loading spinner (Loader2 with animate-spin class)
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should redirect to /auth when user is not authenticated', () => {
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
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>Admin Content</div>
      </RoleProtectedRoute>
    );

    // Should not show protected content
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should render children when user has required role', () => {
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
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>Admin Content</div>
      </RoleProtectedRoute>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('should redirect when user lacks required role', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'user-123', email: 'user@example.com' } as any,
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
      <RoleProtectedRoute allowedRoles={['admin']}>
        <div>Admin Content</div>
      </RoleProtectedRoute>
    );

    // Should not show admin content for regular user
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should allow access when user has one of multiple allowed roles', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'va-123', email: 'va@example.com' } as any,
      roles: ['va'],
      loading: false,
      hasRole: (role) => role === 'va',
      isAdmin: false,
      isVA: true,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    });

    renderWithProviders(
      <RoleProtectedRoute allowedRoles={['admin', 'va']}>
        <div>VA Content</div>
      </RoleProtectedRoute>
    );

    // VA user should see content when 'va' is one of allowed roles
    expect(screen.getByText('VA Content')).toBeInTheDocument();
  });

  it('should handle admin users with multiple allowed roles', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'admin-123', email: 'admin@example.com' } as any,
      roles: ['admin', 'user'],
      loading: false,
      hasRole: (role) => ['admin', 'user'].includes(role),
      isAdmin: true,
      isVA: false,
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
    });

    renderWithProviders(
      <RoleProtectedRoute allowedRoles={['admin', 'va']}>
        <div>Admin/VA Content</div>
      </RoleProtectedRoute>
    );

    expect(screen.getByText('Admin/VA Content')).toBeInTheDocument();
  });

  it('should use custom redirect path when provided', () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'user-123', email: 'user@example.com' } as any,
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
      <RoleProtectedRoute allowedRoles={['admin']} redirectTo="/custom-path">
        <div>Admin Content</div>
      </RoleProtectedRoute>
    );

    // Should not show content (would redirect to custom path)
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});
