import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedPlan = searchParams.get('plan');
  const mode = searchParams.get('mode');
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth loading to complete
    if (loading) return;
    
    // Not logged in - show auth form
    if (!user) return;

    // CRITICAL: If user signed up with a plan, ALWAYS redirect to Stripe checkout first
    // Do NOT let them access the app without paying
    if (selectedPlan && !redirectingToCheckout) {
      setRedirectingToCheckout(true);
      
      console.log('[Auth] User signed up with plan:', selectedPlan, '- redirecting to Stripe checkout');
      
      // Call Stripe checkout
      supabase.functions.invoke('create-checkout-session', {
        body: { 
          tier_name: selectedPlan,
          billing_cycle: 'monthly'
        }
      }).then(({ data, error }) => {
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
          console.error('[Auth] No checkout URL returned');
          setCheckoutError('Checkout unavailable. Please try again from the pricing page.');
          setRedirectingToCheckout(false);
        }
      });
      
      return; // Don't do any other redirects while checkout is in progress
    }

    // For non-payment flows (no selectedPlan), do normal role-based redirect
    if (roles.length > 0) {
      if (roles.includes('va')) {
        navigate('/upload');
      } else if (roles.includes('admin')) {
        navigate('/leads');
      } else {
        // For users with just 'user' role, send to settings 
        // They'll see the subscription upgrade options there
        navigate('/settings');
      }
    }
  }, [user, roles, loading, navigate, selectedPlan, redirectingToCheckout]);

  // Show loading while checking auth or redirecting to checkout
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

  // Show loading while redirecting to checkout
  if (redirectingToCheckout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Setting up your subscription...</p>
          <p className="text-xs text-muted-foreground">Redirecting to secure checkout...</p>
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
