import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CreditCard, Coins, Sparkles, Loader2, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PAYG_PRICE_DISPLAY } from "@/lib/pricing";
import { useQueryClient } from "@tanstack/react-query";
import { useUnlockBalances } from "@/hooks/useUnlockBalances";

interface UnlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    snap_score: number | null;
    snap_insight: string | null;
  } | null;
  /** @deprecated balances are now fetched internally via useUnlockBalances */
  freeUnlocksRemaining?: number;
  onUnlocked?: () => void;
}

export function UnlockModal({
  open,
  onOpenChange,
  property,
  onUnlocked,
}: UnlockModalProps) {
  const [isUnlocking, setIsUnlocking] = useState<string | null>(null); // tracks which source is in-flight
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: balances } = useUnlockBalances();

  if (!property) return null;

  const subscriptionRemaining = balances?.subscription_remaining ?? 0;
  const creditBalance = balances?.credit_balance ?? 0;
  const freeRemaining = balances?.free_remaining ?? 0;
  const planName = balances?.plan_name ?? null;
  const renewalDate = balances?.renewal_date ?? null;

  const handleUnlock = async (source: "subscription" | "credit" | "free") => {
    if (!user) return;
    setIsUnlocking(source);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-unlock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ property_id: property.id, source }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 402) {
          toast({
            variant: "destructive",
            title: "Insufficient balance",
            description: "Purchase credits or subscribe to unlock properties.",
          });
        } else {
          throw new Error(data.error || "Unlock failed");
        }
        return;
      }

      const sourceLabels: Record<string, string> = {
        subscription: "Monthly unlock used.",
        credit: `1 credit used. ${data.credits_remaining ?? ""} remaining.`,
        free: `Free unlock used. ${data.free_remaining ?? ""} remaining.`,
        already_unlocked: "Already unlocked.",
      };

      toast({
        title: "Property unlocked! 🔓",
        description: sourceLabels[data.source] ?? "Unlocked successfully.",
      });

      queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["user", "credits"] });
      queryClient.invalidateQueries({ queryKey: ["unlock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["property-contacts", property.id] });

      onUnlocked?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Unlock failed",
        description: err.message,
      });
    } finally {
      setIsUnlocking(null);
    }
  };

  const handleBuyUnlock = async () => {
    if (!user) return;
    setIsCheckingOut(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            checkout_type: "single_unlock",
            property_id: property.id,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: err.message,
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-500";
    if (score >= 25) return "bg-yellow-500";
    return "bg-blue-500";
  };

  const anyActionBusy = isUnlocking !== null || isCheckingOut;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Unlock Property
          </DialogTitle>
          <DialogDescription>
            Get full address, owner contacts, and export access.
          </DialogDescription>
        </DialogHeader>

        {/* Property Summary */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground truncate">
              {property.city}, {property.state}
            </p>
            <Badge
              className={`${getScoreColor(property.snap_score)} text-white text-xs font-bold`}
            >
              🔥 {property.snap_score ?? 0}
            </Badge>
          </div>
          {property.snap_insight && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {property.snap_insight}
            </p>
          )}
        </div>

        {/* Unlock Options — all shown simultaneously */}
        <div className="space-y-3">
          {/* 1. Subscription monthly allowance */}
          {subscriptionRemaining > 0 && (
            <Button
              onClick={() => handleUnlock("subscription")}
              disabled={anyActionBusy}
              className="w-full gap-2 bg-teal-600 hover:bg-teal-700"
              size="lg"
            >
              {isUnlocking === "subscription" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarDays className="h-4 w-4" />
              )}
              Use Monthly Unlock ({subscriptionRemaining} left
              {planName ? ` · ${planName}` : ""}
              {renewalDate ? ` · resets ${renewalDate}` : ""})
            </Button>
          )}

          {/* 2. Bulk credits */}
          {creditBalance >= 1 && (
            <Button
              onClick={() => handleUnlock("credit")}
              disabled={anyActionBusy}
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {isUnlocking === "credit" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Coins className="h-4 w-4" />
              )}
              Use 1 Credit ({creditBalance} available)
            </Button>
          )}

          {/* 3. Free unlocks */}
          {freeRemaining > 0 && (
            <Button
              onClick={() => handleUnlock("free")}
              disabled={anyActionBusy}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              size="lg"
            >
              {isUnlocking === "free" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Use Free Unlock ({freeRemaining} left)
            </Button>
          )}

          {/* 4. PAYG — always shown */}
          <Button
            variant={subscriptionRemaining > 0 || creditBalance >= 1 || freeRemaining > 0 ? "outline" : "default"}
            onClick={handleBuyUnlock}
            disabled={anyActionBusy}
            className="w-full gap-2"
            size="lg"
          >
            {isCheckingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Buy Unlock — ${PAYG_PRICE_DISPLAY}
          </Button>

          {/* Subscribe CTA when no free options */}
          {subscriptionRemaining <= 0 && creditBalance < 1 && freeRemaining <= 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Or{" "}
              <a href="/pricing" className="text-primary hover:underline font-medium">
                subscribe for monthly unlocks
              </a>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
