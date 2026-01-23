import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/useSubscription';
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
  const { plan, loading: subLoading, hasActiveSubscription } = useSubscription();
  const location = useLocation();

  // Wait for both auth and subscription to load
  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admins can access everything
  const isAdmin = hasRole('admin');
  const hasRequiredRole = isAdmin || allowedRoles.some(role => hasRole(role));

  // Check if user has an active subscription (paid user)
  const hasPaidSubscription = hasActiveSubscription && plan?.name;

  if (!hasRequiredRole) {
    // If user has an active subscription, give them access to admin-level features
    // This handles the case where a paying user only has 'user' role
    if (hasPaidSubscription && allowedRoles.includes('admin')) {
      return <>{children}</>;
    }
    
    // If user only has 'user' role and NO active subscription (new signup without payment)
    if (hasRole('user') && roles.length === 1 && !hasPaidSubscription) {
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4 p-4">
          <h1 className="text-2xl font-bold text-foreground">Welcome to Snap Ignite!</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Your account is set up. Please complete your subscription to access the full platform.
          </p>
          <a href="/pricing" className="text-primary hover:underline">View Pricing Plans</a>
        </div>
      );
    }
    
    // Prevent redirect loops - if already on the redirect target, show access denied
    if (location.pathname === redirectTo) {
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4">
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
          <a href="/auth" className="text-primary hover:underline">Sign in with a different account</a>
        </div>
      );
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
