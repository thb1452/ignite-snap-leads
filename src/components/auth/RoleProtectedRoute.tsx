import { ReactNode, useState, useEffect } from 'react';
import { Navigate, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/useSubscription';
import { EmailVerificationPrompt } from './EmailVerificationPrompt';
import { Loader2, CheckCircle2, RefreshCw } from 'lucide-react';

const CHECKOUT_PROCESSED_KEY = 'snap_checkout_processed';
// Key to track if user is in the middle of signup → checkout flow
const PENDING_CHECKOUT_KEY = 'snap_pending_checkout';

interface RoleProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  redirectTo?: string;
}

export function RoleProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/leads'
}: RoleProtectedRouteProps) {
  const { user, loading, hasRole, emailVerified } = useAuth();
  const { plan, loading: subLoading, hasActiveSubscription, refetch } = useSubscription();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Track subscription polling state
  const [pollCount, setPollCount] = useState(0);
  const [hasGivenUp, setHasGivenUp] = useState(false);

  // Initialize checkoutProcessed from sessionStorage to survive navigation/refresh
  const [checkoutProcessed, setCheckoutProcessed] = useState(() => {
    try {
      return sessionStorage.getItem(CHECKOUT_PROCESSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Check if user just came from checkout - URL param is available synchronously on first render
  const checkoutSuccess = searchParams.get('checkout') === 'success';

  // CRITICAL: Combine both signals to handle first render race condition
  // - checkoutSuccess: URL param, available immediately on first render
  // - checkoutProcessed: sessionStorage, persists across navigation/refresh
  const inCheckoutFlow = checkoutSuccess || checkoutProcessed;

  // Handle checkout success detection and persist to sessionStorage
  useEffect(() => {
    if (checkoutSuccess && !checkoutProcessed) {
      // Mark as processed and persist to sessionStorage
      setCheckoutProcessed(true);
      try {
        sessionStorage.setItem(CHECKOUT_PROCESSED_KEY, 'true');
        console.log('[RoleProtectedRoute] Checkout detected, saved to sessionStorage');
      } catch (e) {
        console.warn('[RoleProtectedRoute] Failed to save to sessionStorage:', e);
      }

      // Remove the checkout param from URL to prevent re-triggering
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('checkout');
      const newUrl = newParams.toString()
        ? `${location.pathname}?${newParams.toString()}`
        : location.pathname;
      navigate(newUrl, { replace: true });
    }
  }, [checkoutSuccess, checkoutProcessed, searchParams, location.pathname, navigate]);

  // Clear sessionStorage flags ONLY after subscription is confirmed in DB
  useEffect(() => {
    if (hasActiveSubscription) {
      try {
        if (checkoutProcessed) {
          sessionStorage.removeItem(CHECKOUT_PROCESSED_KEY);
          console.log('[RoleProtectedRoute] Subscription confirmed, cleared checkout processed flag');
        }
        // Also clear pending checkout flag
        sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
      } catch (e) {
        console.warn('[RoleProtectedRoute] Failed to clear sessionStorage:', e);
      }
    }
  }, [hasActiveSubscription, checkoutProcessed]);

  // Derived state - only poll if we detected checkout AND no subscription yet
  // Use inCheckoutFlow to handle first render (before effect saves to sessionStorage)
  const isPolling = inCheckoutFlow && !hasActiveSubscription && !hasGivenUp && pollCount < 20;

  // Poll for subscription when user just paid but subscription not yet showing
  useEffect(() => {
    if (!loading && !subLoading && user && inCheckoutFlow && !hasActiveSubscription && !hasGivenUp) {
      if (pollCount < 20) {
        const timer = setTimeout(() => {
          console.log('[RoleProtectedRoute] Polling for subscription... attempt', pollCount + 1);
          refetch();
          setPollCount(prev => prev + 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        console.log('[RoleProtectedRoute] Max polls reached, waiting for manual action');
        setHasGivenUp(true);
      }
    }
  }, [loading, subLoading, user, inCheckoutFlow, hasActiveSubscription, pollCount, refetch, hasGivenUp]);

  // Derive role checks early (needed for admin bypass before subscription loads)
  const isAdmin = hasRole('admin');
  const isVA = hasRole('va');
  const hasRequiredRole = isAdmin || allowedRoles.some(role => hasRole(role));

  // Wait for auth to load first (always)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // CRITICAL: Admin and VA bypass - check AFTER auth loads but BEFORE subscription check
  // This ensures staff can access admin routes without needing a subscription
  if (user && emailVerified && (isAdmin || isVA) && hasRequiredRole) {
    return <>{children}</>;
  }

  // Wait for subscription to load (for non-staff users only)
  if (subLoading) {
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

  // Fallback: polling timed out but user is in checkout flow (they paid)
  // Show helpful message instead of "View Pricing Plans" loop
  if (inCheckoutFlow && !hasActiveSubscription && hasGivenUp) {
    const handleManualRefresh = () => {
      setPollCount(0);
      setHasGivenUp(false);
      refetch();
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-20 h-20 mx-auto rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Your payment is being processed</h1>
          <p className="text-muted-foreground">
            This may take a minute. Your subscription will be activated shortly.
          </p>
          <button
            onClick={handleManualRefresh}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition font-medium"
          >
            <RefreshCw className="h-4 w-4" />
            Check Again
          </button>
          <p className="text-xs text-muted-foreground">
            If this persists, please contact{' '}
            <a href="mailto:support@snapignite.com" className="text-primary hover:underline">
              support@snapignite.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Require email verification before accessing protected routes
  if (!emailVerified) {
    return <EmailVerificationPrompt />;
  }

  // Staff bypass already handled above (early return for admin/va)

  // Check if user has an active subscription (paid user)
  const hasPaidSubscription = hasActiveSubscription && plan?.name;
  
  // CRITICAL: Grant access if user just paid (inCheckoutFlow), even if webhook hasn't processed yet
  // After 20s of polling, hasGivenUp is true - we trust they paid
  const grantAccessFromPayment = inCheckoutFlow && (hasPaidSubscription || hasGivenUp);

  // PAID USERS: Anyone with an active subscription can access admin-level routes
  if (hasPaidSubscription || grantAccessFromPayment) {
    console.log('[RoleProtectedRoute] Granting access - paid user:', { hasPaidSubscription, grantAccessFromPayment });
    return <>{children}</>;
  }

  if (!hasRequiredRole) {
    // Check if user is in a pending checkout flow (just signed up, about to go to Stripe)
    const isPendingCheckout = (() => {
      try {
        return sessionStorage.getItem(PENDING_CHECKOUT_KEY) === 'true';
      } catch {
        return false;
      }
    })();
    
    // If user only has 'user' role and NO subscription AND NOT in checkout flow
    // This is a new signup who hasn't completed payment
    if (hasRole('user') && !hasPaidSubscription && !inCheckoutFlow && !isPendingCheckout) {
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
