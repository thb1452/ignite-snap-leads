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
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);

  useEffect(() => {
    // Only redirect if user is logged in and roles are loaded
    if (!loading && user && roles.length > 0) {
      // If user just signed up with a plan, redirect to Stripe checkout
      if (selectedPlan && !redirectingToCheckout) {
        setRedirectingToCheckout(true);
        
        // Call Stripe checkout
        supabase.functions.invoke('create-checkout-session', {
          body: { 
            tier_name: selectedPlan,
            billing_cycle: 'monthly'
          }
        }).then(({ data, error }) => {
          if (error) {
            console.error('Checkout error:', error);
            // Fall back to leads page if checkout fails
            navigate('/leads');
            return;
          }
          if (data?.checkout_url) {
            window.location.href = data.checkout_url;
          } else {
            navigate('/leads');
          }
        });
        return;
      }

      // Regular role-based redirect
      if (roles.includes('va')) {
        navigate('/upload');
      } else if (roles.includes('admin')) {
        navigate('/leads');
      } else {
        // For users with just 'user' role, go to settings or a welcome page
        navigate('/settings');
      }
    }
  }, [user, roles, loading, navigate, selectedPlan, redirectingToCheckout]);

  // Show loading while redirecting to checkout
  if (redirectingToCheckout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Setting up your subscription...</p>
        </div>
      </div>
    );
  }

  // Show auth form if not logged in or still loading
  return <AuthForm />;
}
