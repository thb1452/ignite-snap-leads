import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/use-auth";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { plan, refetch, hasActiveSubscription } = useSubscription();
  const [pollingCount, setPollingCount] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  // Set the pending flag immediately on mount
  useEffect(() => {
    sessionStorage.setItem('snap_checkout_pending', 'true');
    console.log('[CheckoutSuccess] Set pending flag on mount');
  }, []);

  // Poll for subscription status (webhook may take a moment)
  useEffect(() => {
    if (authLoading || !user) return;

    // If we have an active subscription, show success and redirect
    if (hasActiveSubscription && plan?.name) {
      console.log('[CheckoutSuccess] Subscription confirmed:', plan.name);
      setShowSuccess(true);
      setShouldRedirect(true);
      return;
    }

    // Poll up to 15 times (15 seconds) waiting for webhook
    if (pollingCount < 15) {
      const timer = setTimeout(() => {
        console.log('[CheckoutSuccess] Polling for subscription...', pollingCount + 1);
        refetch();
        setPollingCount(prev => prev + 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // After 15 seconds, redirect anyway - webhook might be delayed
    // The RoleProtectedRoute will continue polling
    console.log('[CheckoutSuccess] Max polls reached, redirecting anyway');
    setShowSuccess(true);
    setShouldRedirect(true);
  }, [user, authLoading, plan, pollingCount, refetch, hasActiveSubscription]);

  // Handle redirect separately to avoid multiple navigation calls
  useEffect(() => {
    if (shouldRedirect) {
      const timer = setTimeout(() => {
        console.log('[CheckoutSuccess] Navigating to /leads?checkout=success');
        navigate('/leads?checkout=success', { replace: true });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [shouldRedirect, navigate]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      console.log('[CheckoutSuccess] No user, redirecting to auth');
      navigate('/auth', { replace: true });
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
        {showSuccess ? (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Payment Successful!</h1>
            <p className="text-muted-foreground">
              Thank you for subscribing to Snap Ignite. Redirecting to your dashboard...
            </p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
          </>
        ) : (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Processing your payment...</h1>
            <p className="text-sm text-muted-foreground">
              Please wait while we confirm your subscription. ({pollingCount}/15)
            </p>
          </>
        )}
      </div>
    </div>
  );
}
