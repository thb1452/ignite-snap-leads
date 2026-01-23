import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Auth() {
  const { user, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedPlan = searchParams.get('plan');
  const mode = searchParams.get('mode');
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showAccountChoice, setShowAccountChoice] = useState(false);

  useEffect(() => {
    console.log('[Auth] useEffect - loading:', loading, 'user:', !!user, 'selectedPlan:', selectedPlan, 'redirectingToCheckout:', redirectingToCheckout, 'showAccountChoice:', showAccountChoice);
    
    // Wait for auth loading to complete
    if (loading) return;
    
    // Not logged in - show auth form
    if (!user) {
      console.log('[Auth] No user, showing auth form');
      return;
    }

    // If user is logged in AND has a plan selected, show choice dialog
    // Let them choose: continue with current account OR create new account
    if (selectedPlan && !redirectingToCheckout && !showAccountChoice) {
      setShowAccountChoice(true);
      return;
    }

    // For non-payment flows (no selectedPlan), do normal role-based redirect
    // Skip if we're showing the signup form with mode param
    if (!mode && !selectedPlan && roles.length > 0) {
      console.log('[Auth] No plan selected, doing role-based redirect. Roles:', roles);
      // For new users without a special role, always go to leads
      // Only VA-specific users go to VA dashboard
      if (roles.includes('va') && !roles.includes('admin') && !roles.includes('user')) {
        navigate('/va-dashboard');
      } else {
        // Default: send everyone to leads (main app)
        navigate('/leads');
      }
    }
  }, [user, roles, loading, navigate, selectedPlan, redirectingToCheckout, mode, showAccountChoice]);

  const handleContinueWithCurrentAccount = () => {
    setShowAccountChoice(false);
    setRedirectingToCheckout(true);
    
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
    // After signout, the auth form will show automatically
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading...</p>
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
