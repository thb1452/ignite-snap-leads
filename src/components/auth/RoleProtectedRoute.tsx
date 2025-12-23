import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

interface RoleProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  redirectTo?: string;
}

export function RoleProtectedRoute({ 
  children, 
  allowedRoles,
  redirectTo = '/va-dashboard'
}: RoleProtectedRouteProps) {
  const { user, roles, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const hasRequiredRole = allowedRoles.some(role => hasRole(role));

  if (!hasRequiredRole) {
    // Prevent redirect loops - if already on the redirect target, show access denied
    if (location.pathname === redirectTo) {
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4">
          <h1 className="text-2xl font-bold text-ink-900">Access Denied</h1>
          <p className="text-ink-500">You don't have permission to access this page.</p>
          <a href="/auth" className="text-primary hover:underline">Sign in with a different account</a>
        </div>
      );
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
