import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole, AppRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/use-auth';
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
  const { user, loading: authLoading } = useAuth();
  const { roles, loading: roleLoading, hasRole } = useUserRole();

  if (authLoading || roleLoading) {
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
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
