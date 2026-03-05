import { ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { Navigate, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { EmailVerificationPrompt } from './EmailVerificationPrompt';
import { Loader2, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/externalClient';

const CHECKOUT_PROCESSED_KEY = 'snap_checkout_processed';
const PENDING_CHECKOUT_KEY = 'snap_pending_checkout';
const LOADING_TIMEOUT_MS = 8000;
const ROLES_CACHE_KEY = 'snap_user_roles_cache';

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
  const { user, loading, hasRole, emailVerified, roles } = useAuth();
  const { plan, loading: subLoading, hasActiveSubscription, refetch } = useSubscription();
  const { isOnTrial, hasTrialExpired, subscriptionStatus } = useTrialStatus();
  const isCancelledOrExpired = subscriptionStatus === 'cancelled' || subscriptionStatus === 'expired';
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ALL HOOKS MUST BE AT THE TOP - BEFORE ANY CONDITIONAL RETURNS
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [hasGivenUp, setHasGivenUp] = useState(false);
  const [isRetryingRoles, setIsRetryingRoles] = useState(false);
  const [roleRetryCount, setRoleRetryCount] = useState(0);

  const [checkoutProcessed, setCheckoutProcessed] = useState(() => {
    try {
      return sessionStorage.getItem(CHECKOUT_PROCESSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const checkoutSuccess = searchParams.get('checkout') === 'success';
  const inCheckoutFlow = checkoutSuccess || checkoutProcessed;

  // Manual role retry function
  const handleRetryRoles = useCallback(async () => {
    if (!user || isRetryingRoles) return;
    
    setIsRetryingRoles(true);
    setRoleRetryCount(prev => prev + 1);
    
    try {
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      
      if (!error && roleData && roleData.length > 0) {
        const fetchedRoles = roleData.map(r => r.role as AppRole);
        try {
          localStorage.setItem(ROLES_CACHE_KEY, JSON.stringify({
            userId: user.id,
            roles: fetchedRoles,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.warn('[RoleProtectedRoute] Error caching roles:', e);
        }
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error('[RoleProtectedRoute] Role retry failed:', err);
    } finally {
      setIsRetryingRoles(false);
    }
  }, [user, isRetryingRoles]);

  // Safety timeout effect
  useEffect(() => {
    if (loading || subLoading) {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          console.warn('[RoleProtectedRoute] Loading timeout reached, forcing complete');
          setLoadingTimedOut(true);
        }, LOADING_TIMEOUT_MS);
      }
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setLoadingTimedOut(false);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [loading, subLoading]);

  // Handle checkout success detection
  useEffect(() => {
    if (checkoutSuccess && !checkoutProcessed) {
      setCheckoutProcessed(true);
      try {
        sessionStorage.setItem(CHECKOUT_PROCESSED_KEY, 'true');
        console.log('[RoleProtectedRoute] Checkout detected, saved to sessionStorage');
      } catch (e) {
        console.warn('[RoleProtectedRoute] Failed to save to sessionStorage:', e);
      }

      const newParams = new URLSearchParams(searchParams);
      newParams.delete('checkout');
      const newUrl = newParams.toString()
        ? `${location.pathname}?${newParams.toString()}`
        : location.pathname;
      navigate(newUrl, { replace: true });
    }
  }, [checkoutSuccess, checkoutProcessed, searchParams, location.pathname, navigate]);

  // Clear sessionStorage after subscription confirmed
  useEffect(() => {
    if (hasActiveSubscription) {
      try {
        if (checkoutProcessed) {
          sessionStorage.removeItem(CHECKOUT_PROCESSED_KEY);
          console.log('[RoleProtectedRoute] Subscription confirmed, cleared checkout processed flag');
        }
        sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
      } catch (e) {
        console.warn('[RoleProtectedRoute] Failed to clear sessionStorage:', e);
      }
    }
  }, [hasActiveSubscription, checkoutProcessed]);

  // Poll for subscription
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

  // Derive computed values
  const isPolling = inCheckoutFlow && !hasActiveSubscription && !hasGivenUp && pollCount < 20;
  const isAdmin = hasRole('admin');
  const isVA = hasRole('va');
  const hasRequiredRole = isAdmin || allowedRoles.some(role => hasRole(role));
  const rolesEmpty = roles.length === 0;

  // NOW WE CAN HAVE CONDITIONAL RETURNS

  // Wait for auth to load first
  if (loading && !loadingTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // CRITICAL: If we have a user but roles are empty after timeout, check subscription/trial first
  // before showing retry UI — trial/paid users should still get access even without roles
  if (user && loadingTimedOut && rolesEmpty) {
    // Check if user has active subscription or trial — let them through
    if (!subLoading && (isOnTrial || hasTrialExpired || isCancelledOrExpired || (hasActiveSubscription && plan?.name))) {
      console.log('[RoleProtectedRoute] Roles empty but user has subscription/trial — granting access');
      return <>{children}</>;
    }

    // Only show retry UI if they also don't have a subscription/trial
    if (!subLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-20 h-20 mx-auto rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <AlertTriangle className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Connection Issue</h1>
            <p className="text-muted-foreground">
              We couldn't verify your account permissions. This is usually a temporary network issue.
            </p>
            <button
              onClick={handleRetryRoles}
              disabled={isRetryingRoles}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition font-medium disabled:opacity-50"
            >
              {isRetryingRoles ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isRetryingRoles ? 'Checking...' : 'Try Again'}
            </button>
            {roleRetryCount > 2 && (
              <p className="text-xs text-muted-foreground">
                Still having trouble? Try refreshing the page or check your internet connection.
              </p>
            )}
          </div>
        </div>
      );
    }
  }

  // Admin and VA bypass
  if (user && (emailVerified || loadingTimedOut) && (isAdmin || isVA) && hasRequiredRole) {
    return <>{children}</>;
  }

  // Early grant: if user has active subscription or trial, skip role/subscription checks
  if (user && (emailVerified || loadingTimedOut) && !subLoading) {
    const hasActiveSub = hasActiveSubscription && plan?.name;
    if (hasActiveSub || isOnTrial || hasTrialExpired || isCancelledOrExpired) {
      console.log('[RoleProtectedRoute] Early access grant - subscription/trial active');
      return <>{children}</>;
    }
  }

  // Wait for subscription to load
  if (subLoading && !loadingTimedOut) {
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

  // Fallback: polling timed out but user is in checkout flow
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
            <a href="mailto:hello@snapignite.com" className="text-primary hover:underline">
              hello@snapignite.com
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

  // Require email verification
  if (!emailVerified) {
    return <EmailVerificationPrompt />;
  }

  // Check subscription
  const hasPaidSubscription = hasActiveSubscription && plan?.name;
  const grantAccessFromPayment = inCheckoutFlow && (hasPaidSubscription || hasGivenUp);

  // PAID USERS or TRIAL USERS: grant access
  if (hasPaidSubscription || grantAccessFromPayment || isOnTrial || hasTrialExpired || isCancelledOrExpired) {
    console.log('[RoleProtectedRoute] Granting access:', { hasPaidSubscription, grantAccessFromPayment, isOnTrial, hasTrialExpired, isCancelledOrExpired });
    return <>{children}</>;
  }

  if (!hasRequiredRole) {
    const isPendingCheckout = (() => {
      try {
        return sessionStorage.getItem(PENDING_CHECKOUT_KEY) === 'true';
      } catch {
        return false;
      }
    })();
    
    if (hasRole('user') && !hasPaidSubscription && !inCheckoutFlow && !isPendingCheckout) {
      return (
        <div className="min-h-screen flex items-center justify-center flex-col gap-4 p-4">
          <h1 className="text-2xl font-bold text-foreground">Welcome to Snap Ignite!</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Your account is set up. Please choose a plan to access the full platform.
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
