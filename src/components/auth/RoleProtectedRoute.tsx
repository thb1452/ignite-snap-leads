import { ReactNode, useState, useEffect } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/useSubscription';
import { Loader2, CheckCircle2 } from 'lucide-react';

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
  const { plan, loading: subLoading, hasActiveSubscription, refetch } = useSubscription();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Track if we're waiting for subscription to propagate after checkout
  const [isWaitingForSubscription, setIsWaitingForSubscription] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  
  // Check if user just came from checkout
  const justPaid = searchParams.get('checkout') === 'success' || 
                   sessionStorage.getItem('snap_checkout_pending') === 'true';

  // If user just paid but subscription not showing, poll for it
  useEffect(() => {
    if (!loading && !subLoading && user && justPaid && !hasActiveSubscription) {
      setIsWaitingForSubscription(true);
      sessionStorage.setItem('snap_checkout_pending', 'true');
      
      if (pollCount < 15) { // Poll for up to 15 seconds
        const timer = setTimeout(() => {
          refetch();
          setPollCount(prev => prev + 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        // After 15s, clear flag and let them through anyway
        sessionStorage.removeItem('snap_checkout_pending');
        setIsWaitingForSubscription(false);
      }
    } else if (hasActiveSubscription && justPaid) {
      // Subscription confirmed - clear the pending flag
      sessionStorage.removeItem('snap_checkout_pending');
      setIsWaitingForSubscription(false);
    }
  }, [loading, subLoading, user, justPaid, hasActiveSubscription, pollCount, refetch]);

  // Wait for auth and subscription to load
  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show waiting state while subscription propagates
  if (isWaitingForSubscription && !hasActiveSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Payment Successful!</h1>
          <p className="text-muted-foreground">
            Activating your subscription...
          </p>
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-xs text-muted-foreground">
            This usually takes just a few seconds.
          </p>
        </div>
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
  
  // CRITICAL: If user just paid, give them benefit of the doubt while webhook processes
  // This prevents the "complete subscription" screen flash after successful payment
  const isPendingPayment = justPaid && !hasActiveSubscription;

  if (!hasRequiredRole) {
    // If user has an active subscription, give them access to admin-level features
    // This handles the case where a paying user only has 'user' role
    if (hasPaidSubscription && allowedRoles.includes('admin')) {
      return <>{children}</>;
    }
    
    // If user JUST PAID but webhook hasn't processed yet, show loading not the error
    if (isPendingPayment && allowedRoles.includes('admin')) {
      console.log('[RoleProtectedRoute] User just paid, waiting for webhook to process');
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Payment Successful!</h1>
            <p className="text-muted-foreground">
              Activating your subscription...
            </p>
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-xs text-muted-foreground">
              This usually takes just a few seconds.
            </p>
          </div>
        </div>
      );
    }
    
    // If user only has 'user' role and NO active subscription AND didn't just pay
    if (hasRole('user') && roles.length === 1 && !hasPaidSubscription && !justPaid) {
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
