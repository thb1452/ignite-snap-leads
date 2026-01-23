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
    console.log('[Auth] useEffect - loading:', loading, 'user:', !!user, 'selectedPlan:', selectedPlan, 'redirectingToCheckout:', redirectingToCheckout);
    
    // Wait for auth loading to complete
    if (loading) return;
    
    // Not logged in - show auth form
    if (!user) {
      console.log('[Auth] No user, showing auth form');
      return;
    }

    // CRITICAL: If user has a plan selected, ALWAYS redirect to Stripe checkout first
    // This handles both fresh signups AND already-logged-in users clicking pricing buttons
    if (selectedPlan && !redirectingToCheckout) {
      setRedirectingToCheckout(true);
      
      console.log('[Auth] User authenticated with plan:', selectedPlan, '- creating Stripe checkout session');
      
      // Call Stripe checkout
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
          // Use multiple redirect methods for better mobile support
          try {
            window.location.replace(checkoutUrl);
          } catch {
            window.location.href = checkoutUrl;
          }
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
      
      return; // Don't do any other redirects while checkout is in progress
    }

    // For non-payment flows (no selectedPlan), do normal role-based redirect
    // Skip if we're showing the signup form with mode param
    if (!mode && !selectedPlan && roles.length > 0) {
      console.log('[Auth] No plan selected, doing role-based redirect. Roles:', roles);
      if (roles.includes('va')) {
        navigate('/upload');
      } else if (roles.includes('admin')) {
        navigate('/leads');
      } else {
        // For users with just 'user' role, send to leads (main app)
        navigate('/leads');
      }
    }
  }, [user, roles, loading, navigate, selectedPlan, redirectingToCheckout, mode]);

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
