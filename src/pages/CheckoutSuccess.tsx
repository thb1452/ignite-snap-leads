import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Clock3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/externalClient";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CUSTOMER_RECORDS_AVAILABLE } from "@/lib/publicAvailability";

type Verification = "checking" | "confirmed" | "pending";
export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<Verification>("checking");
  const [message, setMessage] = useState("Verifying this checkout with your billing account.");
  const [attempt, setAttempt] = useState(0);
  const sessionId = params.get("session_id");
  const isPack = params.has("credits_added"); // Routing hint only; credits are verified on the server.

  useEffect(() => {
    if (authLoading || !user) return;
    if (!sessionId) {
      setState("pending");
      setMessage("This page has no checkout reference. Check your billing settings or contact support; no new payment has been confirmed here.");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    setState("checking");
    async function verify() {
      tries++;
      try {
        const { data, error } = await supabase.functions.invoke(isPack ? "verify-bulk-credits" : "verify-subscription", {
          method: "POST", body: { session_id: sessionId },
        });
        if (cancelled) return;
        const confirmed = !error && (isPack ? data?.fulfilled === true : data?.confirmed === true);
        if (confirmed) {
          setState("confirmed");
          setMessage(isPack ? `${data.credits.toLocaleString()} purchased credits are recorded in your account.`
            : data.status === "trialing" ? "Your existing trial is verified." : "Your subscription checkout is verified.");
          for (const key of ["subscription", "subscription-usage", "trial-status", "credits"]) {
            void queryClient.invalidateQueries({ queryKey: [key] });
          }
          // Revenue conversion events belong to the durable server invoice receipt,
          // not this browser page, an old active subscription, or a query parameter.
          return;
        }
      } catch { /* Retry temporarily pending provider or database state. */ }
      if (cancelled) return;
      if (tries < 8) timer = setTimeout(verify, 1500);
      else {
        setState("pending");
        setMessage("We have not confirmed this checkout yet. Please do not pay again. Check billing settings or contact support with your checkout reference.");
      }
    }
    void verify();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [authLoading, user, sessionId, isPack, queryClient, attempt]);

  if (!authLoading && !user) return <div className="min-h-screen flex items-center justify-center p-6"><div className="max-w-md text-center space-y-4">
    <h1 className="text-2xl font-bold">Sign in to verify your checkout</h1><p>Your payment status is not confirmed on this page.</p>
    <Button asChild><Link to="/auth?mode=signin">Sign in</Link></Button></div></div>;
  return <div className="min-h-screen flex items-center justify-center bg-background p-6"><div className="text-center space-y-6 max-w-md">
    {state === "checking" ? <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
      : state === "confirmed" ? <CheckCircle2 className="h-12 w-12 mx-auto text-primary" /> : <Clock3 className="h-12 w-12 mx-auto text-primary" />}
    <h1 className="text-2xl font-bold">{state === "checking" ? "Checking your checkout" : state === "confirmed" ? "Checkout verified" : "Confirmation pending"}</h1>
    <p className="text-muted-foreground">{message}</p>
    {!CUSTOMER_RECORDS_AVAILABLE && <p className="text-sm">Customer record access, unlocks, and exports remain paused during relaunch verification.</p>}
    <div className="flex justify-center gap-3 flex-wrap">
      {state === "pending" && sessionId && <Button onClick={() => setAttempt(n => n + 1)}>Check again</Button>}
      <Button variant="outline" asChild><Link to="/settings?tab=subscription">Billing settings</Link></Button>
      {state === "confirmed" && <Button asChild><Link to="/crm/pipeline">Open my CRM</Link></Button>}
    </div>
  </div></div>;
}
