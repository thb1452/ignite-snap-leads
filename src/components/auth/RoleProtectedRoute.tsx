import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/use-auth';
import { hasAllowedRole } from '@/lib/authBoundary';
import { EmailVerificationPrompt } from './EmailVerificationPrompt';
import { Loader2 } from 'lucide-react';

interface RoleProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  redirectTo?: string;
}

export function RoleProtectedRoute({ children, allowedRoles, redirectTo = '/properties' }: RoleProtectedRouteProps) {
  const { user, loading, roles, emailVerified, authError, refreshPermissions } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Checking account permissions"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">We couldn’t verify your permissions</h1>
        <p className="text-muted-foreground">Please try again before opening this page.</p>
        <button className="rounded-md bg-primary px-6 py-3 text-primary-foreground" onClick={refreshPermissions}>Try again</button>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth?mode=signin" replace />;
  if (!emailVerified) return <EmailVerificationPrompt />;

  // Payment, trial state, checkout URLs and loading timeouts never grant roles.
  if (!hasAllowedRole(roles, allowedRoles)) {
    if (location.pathname !== redirectTo) return <Navigate to={redirectTo} replace />;
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="text-muted-foreground">Your account does not have permission to open this page.</p>
        <a href="/" className="text-primary underline">Return home</a>
      </div>
    );
  }
  return <>{children}</>;
}
