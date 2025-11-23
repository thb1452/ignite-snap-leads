import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
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
  redirectTo = '/'
}: RoleProtectedRouteProps) {
  const { user, roles, loading, hasRole } = useAuth();

  console.log('[RoleProtectedRoute] Loading:', loading);
  console.log('[RoleProtectedRoute] User:', user?.id);
  console.log('[RoleProtectedRoute] Current roles:', roles);
  console.log('[RoleProtectedRoute] Required roles:', allowedRoles);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    console.log('[RoleProtectedRoute] No user, redirecting to /auth');
    return <Navigate to="/auth" replace />;
  }

  const hasRequiredRole = allowedRoles.some(role => hasRole(role));
  console.log('[RoleProtectedRoute] Has required role?', hasRequiredRole);

  if (!hasRequiredRole) {
    console.log('[RoleProtectedRoute] Missing required role, redirecting to:', redirectTo);
    return <Navigate to={redirectTo} replace />;
  }

  console.log('[RoleProtectedRoute] Access granted');
  return <>{children}</>;
}
