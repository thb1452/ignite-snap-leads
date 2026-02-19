import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/externalClient";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Session storage key to track if a user was logged in BEFORE visiting pricing/auth
const SESSION_KEY_PRE_AUTH_USER = 'snap_pre_auth_user_existed';

const LOADING_TIMEOUT_MS = 5000;

export default function Auth() {
  const { user, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedPlan = searchParams.get('plan');
  const mode = searchParams.get('mode');
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showAccountChoice, setShowAccountChoice] = useState(false);
  const [showAlreadyLoggedIn, setShowAlreadyLoggedIn] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  // Track if we've already initiated a redirect (prevent multiple redirects)
  const hasRedirected = useRef(false);

  // TRUE = user was logged in when /auth page first loaded (session existed in localStorage)
  // FALSE = user was not logged in on load (they just signed in during this visit)
  const wasLoggedInOnMount = useRef<boolean | null>(null);

  // Flag set by pricing page when logged-in user clicks a plan
  const wasLoggedInBeforeFlow = useRef<boolean | null>(null);

  // Check pre-auth flag & capture initial session state on mount
  useEffect(() => {
    try {
      const preAuthFlag = sessionStorage.getItem(SESSION_KEY_PRE_AUTH_USER);
      wasLoggedInBeforeFlow.current = preAuthFlag === 'true';
      sessionStorage.removeItem(SESSION_KEY_PRE_AUTH_USER);
    } catch (e) {
      wasLoggedInBeforeFlow.current = false;
    }

    // Check if a session already exists in localStorage RIGHT NOW (before any auth state change)
    // This is synchronous so we get the true "on mount" state
    supabase.auth.getSession().then(({ data }) => {
      if (wasLoggedInOnMount.current === null) {
        wasLoggedInOnMount.current = !!data.session?.user;
        console.log('[Auth] Mount session check - was logged in:', wasLoggedInOnMount.current);
      }
    });
  }, []);

  // Safety timeout for loading state
  useEffect(() => {
    if (loading && !loadingTimedOut) {
      const timer = setTimeout(() => {
        console.warn('[Auth] Loading timeout reached, forcing complete');
        setLoadingTimedOut(true);
      }, LOADING_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
  }, [loading, loadingTimedOut]);

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    const isFromPricing = mode === 'signup' && selectedPlan;

    if (isFromPricing) {
      if (!redirectingToCheckout && !showAccountChoice) {
        if (wasLoggedInBeforeFlow.current === true) {
          setShowAccountChoice(true);
        } else {
          handleDirectCheckout();
        }
      }
      return;
    }

    // Not from pricing: did the user JUST sign in, or were they already logged in?
    // Treat null (async check not yet resolved) the same as false — assume fresh sign-in
    // to avoid the race condition where the redirect is skipped entirely.
    if (wasLoggedInOnMount.current !== true && !hasRedirected.current) {
      // Fresh sign-in → redirect to dashboard
      hasRedirected.current = true;
      console.log('[Auth] Fresh sign-in, redirecting to dashboard. Roles:', roles);
      if (roles.includes('va') && !roles.includes('admin') && !roles.includes('user')) {
        navigate('/va-dashboard', { replace: true });
      } else {
        navigate('/leads', { replace: true });
      }
      return;
    }

    // Only show "already logged in" if we've confirmed they were logged in on mount
    if (wasLoggedInOnMount.current === true && !showAlreadyLoggedIn && !hasRedirected.current) {
      console.log('[Auth] User was already logged in on page load, showing options');
      setShowAlreadyLoggedIn(true);
    }
  }, [user, roles, loading, navigate, selectedPlan, redirectingToCheckout, mode, showAccountChoice, showAlreadyLoggedIn]);

  // Direct checkout function for fresh signups
  const handleDirectCheckout = () => {
    if (redirectingToCheckout) return;
    setRedirectingToCheckout(true);

    // Mark that checkout is pending (prevents "complete subscription" screen from showing)
    try {
      sessionStorage.setItem('snap_pending_checkout', 'true');
    } catch (e) {
      console.warn('[Auth] Failed to set pending checkout flag:', e);
    }

    console.log('[Auth] Direct checkout for fresh signup, plan:', selectedPlan);

    supabase.functions.invoke('create-checkout-session', {
      body: {
        tier_name: selectedPlan,
        billing_cycle: 'monthly'
      }
    }).then(({ data, error }) => {
      console.log('[Auth] Stripe response:', { data, error });

      if (error) {
        console.error('[Auth] Checkout error:', error);
        setCheckoutError('Failed to start checkout. Please try again from the pricing page.');
        setRedirectingToCheckout(false);
        return;
      }

      const checkoutUrl = data?.checkout_url || data?.url;
      if (checkoutUrl) {
        console.log('[Auth] Redirecting to Stripe checkout:', checkoutUrl);
        window.location.href = checkoutUrl;
      } else {
        console.error('[Auth] No checkout URL returned:', data);
        setCheckoutError('Checkout unavailable. Please try again from the pricing page.');
        setRedirectingToCheckout(false);
      }
    }).catch((err) => {
      console.error('[Auth] Checkout network error:', err);
      setCheckoutError('Network error. Please check your connection and try again.');
      setRedirectingToCheckout(false);
    });
  };

  const handleContinueWithCurrentAccount = () => {
    setShowAccountChoice(false);
    setRedirectingToCheckout(true);

    // Mark that checkout is pending
    try {
      sessionStorage.setItem('snap_pending_checkout', 'true');
    } catch (e) {
      console.warn('[Auth] Failed to set pending checkout flag:', e);
    }

    console.log('[Auth] Continuing with current account, creating Stripe checkout for:', selectedPlan);

    supabase.functions.invoke('create-checkout-session', {
      body: {
        tier_name: selectedPlan,
        billing_cycle: 'monthly'
      }
    }).then(({ data, error }) => {
      console.log('[Auth] Stripe response:', { data, error });

      if (error) {
        console.error('[Auth] Checkout error:', error);
        setCheckoutError('Failed to start checkout. Please try again from the pricing page.');
        setRedirectingToCheckout(false);
        return;
      }

      const checkoutUrl = data?.checkout_url || data?.url;
      if (checkoutUrl) {
        console.log('[Auth] Redirecting to Stripe checkout:', checkoutUrl);
        window.location.href = checkoutUrl;
      } else {
        console.error('[Auth] No checkout URL returned:', data);
        setCheckoutError('Checkout unavailable. Please try again from the pricing page.');
        setRedirectingToCheckout(false);
      }
    }).catch((err) => {
      console.error('[Auth] Checkout network error:', err);
      setCheckoutError('Network error. Please check your connection and try again.');
      setRedirectingToCheckout(false);
    });
  };

  const handleCreateNewAccount = async () => {
    console.log('[Auth] User wants new account, signing out...');
    await signOut();
    setShowAccountChoice(false);
    setShowAlreadyLoggedIn(false);
    // After signout, the auth form will show automatically
  };

  const handleGoToDashboard = () => {
    console.log('[Auth] Going to dashboard. Roles:', roles);
    if (roles.includes('va') && !roles.includes('admin') && !roles.includes('user')) {
      navigate('/va-dashboard');
    } else {
      navigate('/leads');
    }
  };

  // Show loading while checking auth (with timeout safety)
  // After timeout, just show the auth form - don't block users if backend is slow
  if (loading && !loadingTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If loading timed out but we still don't have clear state, show auth form
  // This prevents infinite loading when backend is unavailable
  if (loadingTimedOut && !user && !showAlreadyLoggedIn && !showAccountChoice && !redirectingToCheckout && !checkoutError) {
    return <AuthForm />;
  }

  // Show "already logged in" screen when user visits /auth while logged in (not from pricing)
  if (showAlreadyLoggedIn && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <div className="text-center space-y-6 max-w-md bg-card p-8 rounded-xl shadow-lg border">
          <h2 className="text-2xl font-bold text-foreground">You're already signed in</h2>
          <p className="text-muted-foreground">
            You're signed in as <span className="font-medium text-foreground">{user.email}</span>
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={handleGoToDashboard} size="lg" className="w-full">
              Go to Dashboard
            </Button>
            <Button onClick={handleCreateNewAccount} variant="outline" size="lg" className="w-full">
              Sign out & use different email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show account choice when logged in user clicks a plan
  if (showAccountChoice && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <div className="text-center space-y-6 max-w-md bg-card p-8 rounded-xl shadow-lg border">
          <h2 className="text-2xl font-bold text-foreground">You're already signed in</h2>
          <p className="text-muted-foreground">
            You're signed in as <span className="font-medium text-foreground">{user.email}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Would you like to continue with this account or create a new one?
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={handleContinueWithCurrentAccount} size="lg" className="w-full">
              Continue with this account
            </Button>
            <Button onClick={handleCreateNewAccount} variant="outline" size="lg" className="w-full">
              Create a new account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show "redirecting to checkout" message while Stripe session is being created
  if (redirectingToCheckout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="text-center space-y-4 p-8">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Setting up your subscription...</h2>
          <p className="text-sm text-muted-foreground">Redirecting to secure checkout...</p>
          <p className="text-xs text-muted-foreground mt-4">If you're not redirected in 5 seconds, <a href="/pricing" className="text-primary underline">click here</a>.</p>
        </div>
      </div>
    );
  }

  // Show error if checkout failed
  if (checkoutError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-red-500 text-6xl">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground">Checkout Error</h2>
          <p className="text-muted-foreground">{checkoutError}</p>
          <div className="flex gap-3 justify-center">
            <a
              href="/pricing"
              className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition"
            >
              View Pricing
            </a>
            <button
              onClick={() => {
                setCheckoutError(null);
                setRedirectingToCheckout(false);
              }}
              className="inline-flex items-center justify-center px-4 py-2 border border-input bg-background rounded-md hover:bg-accent transition"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show auth form if not logged in
  return <AuthForm />;
}
