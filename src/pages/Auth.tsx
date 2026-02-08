import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/externalClient";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Session storage key to track if a user was logged in BEFORE visiting pricing/auth
// This persists across the signup flow so we know if they're a fresh signup vs existing user
const SESSION_KEY_PRE_AUTH_USER = 'snap_pre_auth_user_existed';

const LOADING_TIMEOUT_MS = 5000; // Auth page loading timeout

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
  const initDone = useRef(false);
  
  // On mount (before auth loads), check if we already flagged this as a pre-existing user
  // This flag is SET by the pricing page when a logged-in user clicks a plan
  const wasLoggedInBeforeFlow = useRef<boolean | null>(null);
  
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    
    // Check if pricing page marked that user was already logged in
    try {
      const preAuthFlag = sessionStorage.getItem(SESSION_KEY_PRE_AUTH_USER);
      wasLoggedInBeforeFlow.current = preAuthFlag === 'true';
      // Clear it immediately so it doesn't persist across unrelated visits
      sessionStorage.removeItem(SESSION_KEY_PRE_AUTH_USER);
      console.log('[Auth] Pre-auth user flag:', wasLoggedInBeforeFlow.current);
    } catch (e) {
      wasLoggedInBeforeFlow.current = false;
    }
  }, []);

  // Safety timeout for loading state - prevent infinite spinner
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
    console.log('[Auth] useEffect - loading:', loading, 'user:', !!user, 'selectedPlan:', selectedPlan, 'mode:', mode, 'redirectingToCheckout:', redirectingToCheckout, 'showAccountChoice:', showAccountChoice, 'wasLoggedInBeforeFlow:', wasLoggedInBeforeFlow.current);
    
    // Wait for auth loading to complete
    if (loading) return;
    
    // Not logged in - show auth form
    if (!user) {
      console.log('[Auth] No user, showing auth form');
      return;
    }

    // User is logged in!
    const isFromPricing = mode === 'signup' && selectedPlan;

    // CRITICAL FIX: If user came from pricing, handle checkout flow - NEVER fall through to navigate('/leads')
    if (isFromPricing) {
      // Only trigger state changes if not already in progress
      if (!redirectingToCheckout && !showAccountChoice) {
        if (wasLoggedInBeforeFlow.current === true) {
          // User was already logged in when they clicked the plan on pricing page - show choice
          console.log('[Auth] Already logged-in user came from pricing, showing account choice');
          setShowAccountChoice(true);
        } else {
          // User just signed up (or wasn't logged in before) - go directly to checkout
          console.log('[Auth] Fresh signup from pricing, redirecting to checkout immediately');
          handleDirectCheckout();
        }
      }
      // Always return when from pricing - never fall through to navigate('/leads')
      return;
    }

    // User is logged in but not from pricing - show options instead of auto-redirecting
    // This allows users to sign out and create a new account if they want
    if (!showAlreadyLoggedIn) {
      console.log('[Auth] User already logged in, showing options');
      setShowAlreadyLoggedIn(true);
      return;
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
