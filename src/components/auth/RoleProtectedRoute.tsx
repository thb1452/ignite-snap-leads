import { ReactNode, useState, useEffect, useCallback } from 'react';
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
  
  // Track subscription polling state
  const [pollCount, setPollCount] = useState(0);
  const [hasGivenUp, setHasGivenUp] = useState(false);
  
  // Check if user just came from checkout
  const checkoutSuccess = searchParams.get('checkout') === 'success';
  const pendingFlag = typeof window !== 'undefined' 
    ? sessionStorage.getItem('snap_checkout_pending') === 'true'
    : false;
  const justPaid = checkoutSuccess || pendingFlag;

  // Derived state
  const isPolling = justPaid && !hasActiveSubscription && !hasGivenUp && pollCount < 20;
  
  // Poll for subscription when user just paid but subscription not yet showing
  useEffect(() => {
    // Only poll if we need to
    if (!loading && !subLoading && user && justPaid && !hasActiveSubscription && !hasGivenUp) {
      // Set the pending flag if we're on checkout success
      if (checkoutSuccess) {
        sessionStorage.setItem('snap_checkout_pending', 'true');
      }
      
      if (pollCount < 20) { // Poll for up to 20 seconds
        const timer = setTimeout(() => {
          console.log('[RoleProtectedRoute] Polling for subscription... attempt', pollCount + 1);
          refetch();
          setPollCount(prev => prev + 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        // After 20s, give up polling but STILL grant access
        console.log('[RoleProtectedRoute] Max polls reached, granting access anyway');
        setHasGivenUp(true);
      }
    }
  }, [loading, subLoading, user, justPaid, hasActiveSubscription, pollCount, refetch, hasGivenUp, checkoutSuccess]);
  
  // Clear pending flag when subscription is confirmed
  useEffect(() => {
    if (hasActiveSubscription && pendingFlag) {
      console.log('[RoleProtectedRoute] Subscription confirmed, clearing pending flag');
      sessionStorage.removeItem('snap_checkout_pending');
    }
  }, [hasActiveSubscription, pendingFlag]);

  // Wait for auth and subscription to load
  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show waiting state while polling for subscription
  if (isPolling) {
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
            This usually takes just a few seconds. ({pollCount}/20)
          </p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admins can access everything
  const isAdmin = hasRole('admin');
  const hasRequiredRole = isAdmin || allowedRoles.some(role => hasRole(role));

  // Check if user has an active subscription (paid user)
  const hasPaidSubscription = hasActiveSubscription && plan?.name;
  
  // CRITICAL: Grant access if user just paid, even if webhook hasn't processed yet
  // After 20s of polling, hasGivenUp is true - we trust they paid
  const grantAccessFromPayment = justPaid && (hasPaidSubscription || hasGivenUp);

  if (!hasRequiredRole) {
    // If user has an active subscription OR just paid, grant admin access
    if ((hasPaidSubscription || grantAccessFromPayment) && allowedRoles.includes('admin')) {
      console.log('[RoleProtectedRoute] Granting access - paid user:', { hasPaidSubscription, grantAccessFromPayment });
      return <>{children}</>;
    }
    
    // If user only has 'user' role and NO subscription AND didn't just pay
    // This is a new signup who hasn't completed payment
    if (hasRole('user') && roles.length === 1 && !hasPaidSubscription && !justPaid) {
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4 p-4">
          <h1 className="text-2xl font-bold text-foreground">Welcome to Snap Ignite!</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Your account is set up. Please complete your subscription to access the full platform.
          </p>
          <a 
            href="/pricing" 
            className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition font-medium"
          >
            View Pricing Plans
          </a>
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
