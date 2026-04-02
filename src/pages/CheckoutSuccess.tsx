import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/externalClient";
import { analytics } from "@/lib/analytics";
import { useQueryClient } from "@tanstack/react-query";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { plan, refetch, hasActiveSubscription } = useSubscription();
  const queryClient = useQueryClient();
  const [pollingCount, setPollingCount] = useState(0);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [verifyAttempted, setVerifyAttempted] = useState(false);
  const verifyCalledRef = useRef(false);

  const isTrial = searchParams.get("trial") === "true";

  // Poll for subscription status, with verify-subscription fallback
  useEffect(() => {
    if (authLoading || !user) return;

    // If we have an active subscription, redirect
    if (hasActiveSubscription && plan?.name) {
      console.log('[CheckoutSuccess] Subscription confirmed:', plan.name);
      analytics.paymentSuccess(plan.name);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
      queryClient.invalidateQueries({ queryKey: ['trial-status'] });
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      setShouldRedirect(true);
      return;
    }

    // Verify immediately so the app unlocks right after checkout instead of waiting on stale cache/webhooks
    if (!verifyCalledRef.current) {
      verifyCalledRef.current = true;
      console.log('[CheckoutSuccess] Calling verify-subscription fallback');
      
      supabase.functions.invoke('verify-subscription', {
        method: 'POST',
        body: {},
      }).then(({ data, error }) => {
        console.log('[CheckoutSuccess] verify-subscription result:', data, error);
        setVerifyAttempted(true);
        queryClient.invalidateQueries({ queryKey: ['subscription'] });
        queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
        queryClient.invalidateQueries({ queryKey: ['trial-status'] });
        queryClient.invalidateQueries({ queryKey: ['credits'] });
        refetch();
      }).catch((err) => {
        console.error('[CheckoutSuccess] verify-subscription error:', err);
        setVerifyAttempted(true);
      });
    }

    // Poll briefly after checkout for a fast handoff back into the app
    if (pollingCount < 12) {
      const timer = setTimeout(() => {
        console.log('[CheckoutSuccess] Polling for subscription...', pollingCount + 1);
        refetch();
        setPollingCount(prev => prev + 1);
      }, 750);
      return () => clearTimeout(timer);
    }

    // After a short grace period, redirect anyway and let the refreshed queries settle on the app page
    console.log('[CheckoutSuccess] Max polls reached, redirecting anyway');
    setShouldRedirect(true);
  }, [user, authLoading, plan, pollingCount, refetch, hasActiveSubscription, queryClient]);

  // Handle redirect separately to avoid multiple navigation calls
  useEffect(() => {
    if (shouldRedirect) {
      const timer = setTimeout(() => {
        console.log('[CheckoutSuccess] Navigating to /properties?checkout=success');
        navigate('/properties?checkout=success', { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [shouldRedirect, navigate]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      console.log('[CheckoutSuccess] No user, redirecting to auth');
      navigate('/auth?mode=signin', { replace: true });
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {isTrial ? "Trial Started!" : "Payment Successful!"}
        </h1>
        <p className="text-muted-foreground">
          {isTrial
            ? "Your 3-day free trial is now active. You have 500 property exports to get started."
            : "Activating your subscription..."}
        </p>
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-xs text-muted-foreground">
          {verifyAttempted
            ? "Verifying your payment with Stripe..."
            : isTrial
              ? "Setting up your account..."
              : "This usually takes just a few seconds."}
        </p>
      </div>
    </div>
  );
}
