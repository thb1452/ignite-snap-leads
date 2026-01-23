import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/use-auth";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { plan, loading: subLoading, refetch } = useSubscription();
  const [pollingCount, setPollingCount] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  // Poll for subscription status (webhook may take a moment)
  useEffect(() => {
    if (authLoading || !user) return;

    // If we have an active plan (not null/undefined), show success and redirect
    if (plan && plan.name) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        navigate('/leads', { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Poll up to 10 times (10 seconds) waiting for webhook
    if (pollingCount < 10) {
      const timer = setTimeout(() => {
        refetch();
        setPollingCount(prev => prev + 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // After 10 seconds, redirect anyway - webhook might be delayed
    // User can still access the app since payment is confirmed by Stripe
    setShowSuccess(true);
    const timer = setTimeout(() => {
      navigate('/leads', { replace: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, authLoading, plan, pollingCount, refetch, navigate]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
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
              Please wait while we confirm your subscription.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
