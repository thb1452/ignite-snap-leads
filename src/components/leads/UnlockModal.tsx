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
import { Separator } from "@/components/ui/separator";
import { Lock, CreditCard, Coins, Sparkles, Loader2, Zap, TrendingUp, Building2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PAYG_PRICE_DISPLAY } from "@/lib/pricing";
import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/useSubscription";
import { useUserCredits } from "@/hooks/useUserProfile";
import { setPendingStripeUnlockCheckout } from "@/utils/pendingStripeUnlock";
import { setPendingStripeCheckout } from "@/utils/pendingStripeCheckout";

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
  freeUnlocksRemaining: number;
  onUnlocked?: () => void;
}

const SUBSCRIPTION_TIERS = [
  { name: "starter", label: "Starter", price: "$49/mo", credits: "750 credits/mo", icon: Zap },
  { name: "professional", label: "Pro", price: "$99/mo", credits: "1,500 credits/mo", icon: TrendingUp },
  { name: "enterprise", label: "Elite", price: "$199/mo", credits: "3,000 credits/mo", icon: Building2 },
];

const BULK_PACKS = [
  { count: 5000, label: "5,000", price: "$750", per: "$0.15/ea" },
  { count: 10000, label: "10,000", price: "$1,300", per: "$0.13/ea" },
  { count: 20000, label: "20,000", price: "$2,200", per: "$0.11/ea" },
];

export function UnlockModal({
  open,
  onOpenChange,
  property,
  freeUnlocksRemaining,
  onUnlocked,
}: UnlockModalProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { hasActiveSubscription, getRemainingCount, subscription, plan } = useSubscription();
  const { data: bulkCreditBalance = 0 } = useUserCredits();

  if (!property) return null;

  const monthlyUnlocksRemaining = hasActiveSubscription ? getRemainingCount("exports") : 0;
  const currentPlanName = subscription?.plan_name ?? plan?.name ?? null;
  const canUseSubscriptionUnlock =
    hasActiveSubscription && (monthlyUnlocksRemaining === null || monthlyUnlocksRemaining > 0);
  const canUseFreeUnlock = freeUnlocksRemaining > 0;
  const canUseBulkCredit = bulkCreditBalance >= 1;

  // Determine which instant-unlock option to show (priority order)
  const hasInstantOption = canUseSubscriptionUnlock || canUseFreeUnlock || canUseBulkCredit;

  const formatRemaining = (value: number | null | undefined) =>
    value === null ? "∞" : Math.max(0, value ?? 0).toLocaleString();

  const handleUnlockWithCredits = async () => {
    if (!user) return;
    setIsUnlocking(true);

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
          body: JSON.stringify({ property_id: property.id }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 402) {
          toast({
            variant: "destructive",
            title: "Insufficient balance",
            description: data.message || "Purchase credits or subscribe to unlock properties.",
          });
        } else {
          throw new Error(data.error || "Unlock failed");
        }
        return;
      }

      const unlockDescription =
        data.source === "subscription_allowance"
          ? `Monthly credit used. ${formatRemaining(data.subscription_remaining)} remaining.`
          : data.source === "free_credit"
            ? `Free unlock used. ${formatRemaining(data.free_remaining)} remaining.`
            : data.source === "credit_pack"
              ? `1 credit used. ${formatRemaining(data.credits_remaining)} credits remaining.`
              : "Full addresses and contacts are now available.";

      toast({
        title: "Property unlocked! 🔓",
        description: unlockDescription,
      });

      queryClient.setQueryData(["optimistic-unlocked", user.id], (old: unknown) => {
        const next = old instanceof Set ? new Set(old) : new Set<string>();
        next.add(property.id);
        return next;
      });
      queryClient.setQueryData(["confirmed-unlocked-local", user.id], (old: unknown) => {
        const next = old instanceof Set ? new Set(old) : new Set<string>();
        next.add(property.id);
        return next;
      });

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["unlocked-properties"] }),
        queryClient.refetchQueries({ queryKey: ["credits"] }),
        queryClient.refetchQueries({ queryKey: ["user", "credits"] }),
        queryClient.refetchQueries({ queryKey: ["subscription"] }),
        queryClient.refetchQueries({ queryKey: ["subscription-usage"] }),
        queryClient.refetchQueries({ queryKey: ["free-unlocks"] }),
      ]);
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
      setIsUnlocking(false);
    }
  };

  const handleStripeCheckout = async (checkoutType: string, extraBody: Record<string, unknown> = {}) => {
    if (!user) return;
    const target = `${checkoutType}-${JSON.stringify(extraBody)}`;
    setIsCheckingOut(true);
    setCheckoutTarget(target);

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
            checkout_type: checkoutType,
            property_id: checkoutType === "single_unlock" ? property.id : undefined,
            ...extraBody,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      const url = data.url || data.checkout_url;
      if (url) {
        // Save pending info in localStorage so the original tab can detect it on focus
        if (checkoutType === "single_unlock" && property && data.sessionId) {
          setPendingStripeUnlockCheckout(data.sessionId, property.id);
        } else if (checkoutType === "subscription") {
          setPendingStripeCheckout("subscription");
        } else if (checkoutType === "bulk_credits") {
          setPendingStripeCheckout("bulk_credits");
        }
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        toast({
          title: "Checkout opened",
          description: "Complete payment in the new tab, then come back here.",
        });
        onOpenChange(false);
        if (!opened) {
          window.location.href = url;
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: err.message,
      });
    } finally {
      setIsCheckingOut(false);
      setCheckoutTarget(null);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-500";
    if (score >= 25) return "bg-yellow-500";
    return "bg-blue-500";
  };

  const isTargetLoading = (target: string) => isCheckingOut && checkoutTarget === target;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

        {/* === SECTION 1: Instant Unlock (if user has balance) === */}
        {hasInstantOption && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unlock Now</p>

            {canUseSubscriptionUnlock && (
              <Button
                onClick={handleUnlockWithCredits}
                disabled={isUnlocking}
                className="w-full gap-2"
                size="lg"
              >
                {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Use Monthly Credit ({formatRemaining(monthlyUnlocksRemaining)} left)
              </Button>
            )}

            {!canUseSubscriptionUnlock && canUseFreeUnlock && (
              <Button
                onClick={handleUnlockWithCredits}
                disabled={isUnlocking}
                className="w-full gap-2"
                size="lg"
              >
                {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Use Free Unlock ({freeUnlocksRemaining} left)
              </Button>
            )}

            {!canUseSubscriptionUnlock && !canUseFreeUnlock && canUseBulkCredit && (
              <Button
                onClick={handleUnlockWithCredits}
                disabled={isUnlocking}
                className="w-full gap-2"
                size="lg"
              >
                {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                Use 1 Credit ({bulkCreditBalance.toLocaleString()} available)
              </Button>
            )}

            {isUnlocking && (
              <p className="text-xs text-muted-foreground">
                Unlocking this property now. Owner contact data may continue loading for a moment after access opens.
              </p>
            )}
          </div>
        )}

        <Separator />

        {/* === SECTION 2: Pay $0.67 for this property === */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay Per Property</p>
          <Button
            variant={hasInstantOption ? "outline" : "default"}
            onClick={() => handleStripeCheckout("single_unlock")}
            disabled={isCheckingOut}
            className="w-full gap-2"
            size="lg"
          >
            {isTargetLoading(`single_unlock-{}`) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Pay {PAYG_PRICE_DISPLAY} for This Property
          </Button>
        </div>

        <Separator />

        {/* === SECTION 3: Subscribe for monthly credits === */}
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {hasActiveSubscription ? "Change Plan" : "Subscribe & Save"}
            </p>
            <div className="grid gap-2">
              {SUBSCRIPTION_TIERS.map((tier) => {
                const Icon = tier.icon;
                const isCurrentPlan = currentPlanName === tier.name;
                const targetKey = `subscription-${JSON.stringify({ tier_name: tier.name, billing_cycle: "monthly" })}`;
                return (
                  <Button
                    key={tier.name}
                    variant="outline"
                    onClick={() =>
                      handleStripeCheckout("subscription", {
                        tier_name: tier.name,
                        billing_cycle: "monthly",
                      })
                    }
                    disabled={isCheckingOut || isCurrentPlan}
                    className="w-full justify-between gap-2 h-auto py-2.5 px-4"
                  >
                    <span className="flex items-center gap-2">
                      {isTargetLoading(targetKey) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                      <span className="font-medium">{tier.label}</span>
                      <span className="text-muted-foreground text-xs">{tier.credits}</span>
                    </span>
                    <span className="font-semibold text-sm">{isCurrentPlan ? "Current" : tier.price}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator />
        </>

        {/* === SECTION 4: Buy Bulk Credits === */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Package className="h-3.5 w-3.5 inline mr-1" />
            Bulk Credit Packs
          </p>
          <div className="grid gap-2">
            {BULK_PACKS.map((pack) => {
              const targetKey = `bulk_credits-${JSON.stringify({ credit_count: pack.count })}`;
              return (
                <Button
                  key={pack.count}
                  variant="outline"
                  onClick={() =>
                    handleStripeCheckout("bulk_credits", { credit_count: pack.count })
                  }
                  disabled={isCheckingOut}
                  className="w-full justify-between gap-2 h-auto py-2 px-4"
                  size="sm"
                >
                  <span className="flex items-center gap-2">
                    {isTargetLoading(targetKey) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Coins className="h-3.5 w-3.5" />
                    )}
                    <span className="font-medium">{pack.label} credits</span>
                    <span className="text-muted-foreground text-xs">{pack.per}</span>
                  </span>
                  <span className="font-semibold text-sm">{pack.price}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
