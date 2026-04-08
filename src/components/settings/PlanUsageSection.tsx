import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useSubscription } from "@/hooks/useSubscription";
import { useFreeUnlocks } from "@/hooks/useFreeUnlocks";
import { useCreditBalance } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/externalClient";
import { setPendingStripeCheckout } from "@/utils/pendingStripeCheckout";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Loader2, Crown, Zap, Sparkles, TrendingUp, Mail, Coins, Package, Gift } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PlanTierName } from "@/types/subscription";
import { useQuery } from "@tanstack/react-query";
import { getCreditBalance } from "@/services/credits";

type MarketTier = "starter" | "professional" | "enterprise";

const PLAN_CONFIGS = {
  free_trial: { icon: Zap, color: "text-blue-500" },
  starter: { icon: TrendingUp, color: "text-green-500" },
  professional: { icon: Sparkles, color: "text-purple-500" },
  enterprise: { icon: Crown, color: "text-amber-500" },
  enterprise_admin: { icon: Crown, color: "text-amber-500" },
};

function planNameToMarketTier(name: PlanTierName | string | undefined): MarketTier | null {
  if (!name) return null;
  if (name === "starter") return "starter";
  if (name === "professional") return "professional";
  if (name === "enterprise" || name === "enterprise_admin") return "enterprise";
  return null;
}

function PlanTierStrip({ selected }: { selected: MarketTier }) {
  const tiers: { id: MarketTier; label: string; price: string }[] = [
    { id: "starter", label: "Starter", price: "$49/mo" },
    { id: "professional", label: "Pro", price: "$99/mo" },
    { id: "enterprise", label: "Elite", price: "$199/mo" },
  ];
  return (
    <div>
      <h4 className="font-medium text-sm text-muted-foreground mb-2">Your tier</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {tiers.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-center text-sm transition-colors",
              selected === t.id
                ? "border-primary bg-primary/5 font-semibold text-foreground ring-1 ring-primary/20"
                : "border-muted bg-background text-muted-foreground"
            )}
          >
            <div>{t.label}</div>
            <div className="text-xs font-normal opacity-80">{t.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SUBSCRIPTION_TIERS = [
  { name: "starter", label: "Starter", price: "$49/mo", credits: "750 credits/mo", icon: Zap },
  { name: "professional", label: "Pro", price: "$99/mo", credits: "1,500 credits/mo", icon: TrendingUp },
  { name: "enterprise", label: "Elite", price: "$199/mo", credits: "3,000 credits/mo", icon: Crown },
];

const BULK_PACKS = [
  { count: 5000, label: "5,000 credits", price: "$750", per: "$0.15/ea" },
  { count: 10000, label: "10,000 credits", price: "$1,300", per: "$0.13/ea" },
  { count: 20000, label: "20,000 credits", price: "$2,200", per: "$0.11/ea" },
];

interface PlanUsageSectionProps {
  listsCount?: number;
  propertiesCount?: number;
}

export function PlanUsageSection({ listsCount = 0, propertiesCount = 0 }: PlanUsageSectionProps) {
  const { subscription, plan, usage, loading: subscriptionLoading } = useSubscription();
  const { freeUnlocksRemaining, isLoading: freeLoading } = useFreeUnlocks();
  const { data: ledgerBalance = 0 } = useQuery({
    queryKey: ["credits", "balance"],
    queryFn: getCreditBalance,
    retry: 1,
    staleTime: 30000,
  });
  const loading = subscriptionLoading || freeLoading;
  const { toast } = useToast();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalUnavailable, setPortalUnavailable] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const { data, error: fnError } = await supabase.functions.invoke('create-portal-session', {
        body: {},
      });
      if (fnError) {
        if (fnError.message?.includes('404') || fnError.message?.includes('No active subscription')) {
          setPortalUnavailable(true);
          return;
        }
        throw new Error(fnError.message || "Failed to create portal session");
      }
      const portalUrl = data?.url;
      if (!portalUrl) {
        setPortalUnavailable(true);
        return;
      }
      window.open(portalUrl, '_blank');
    } catch (error: any) {
      console.error("[PlanUsageSection] Portal error:", error);
      toast({
        title: "Portal Failed",
        description: error.message || "Failed to open customer portal",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCheckout = async (checkoutType: string, extraBody: Record<string, unknown> = {}) => {
    const key = `${checkoutType}-${JSON.stringify(extraBody)}`;
    try {
      setCheckoutLoading(key);
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: { checkout_type: checkoutType, return_path: "/settings?tab=subscription", ...extraBody },
      });

      if (fnError) throw new Error(fnError.message || "Failed to create checkout session");

      const pendingPayload = checkoutType === "subscription"
        ? {
            type: "subscription" as const,
            expectedTier: extraBody.tier_name as "starter" | "professional" | "enterprise" | undefined,
            returnPath: "/settings?tab=subscription",
          }
        : checkoutType === "bulk_credits"
          ? {
              type: "bulk_credits" as const,
              expectedBalance: Number(extraBody.credit_count ?? 0) || undefined,
              returnPath: "/settings?tab=subscription",
            }
          : null;

      if (data?.upgraded) {
        if (pendingPayload) {
          setPendingStripeCheckout(pendingPayload);
        }
        const rUrl = data.redirect_url || `${window.location.origin}/checkout/success`;
        window.location.href = rUrl;
        return;
      }

      const checkoutUrl = data?.url || data?.checkout_url;
      if (!checkoutUrl) throw new Error("No checkout URL returned. Please try again.");
      if (pendingPayload) {
        setPendingStripeCheckout(pendingPayload);
      }
      window.location.href = checkoutUrl;
    } catch (error: any) {
      toast({
        title: "Checkout Failed",
        description: error.message || "Failed to start checkout process",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const isTargetLoading = (key: string) => checkoutLoading === key;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasSubscriptionPlan = Boolean(subscription && plan);
  const selectedMarketTier = hasSubscriptionPlan ? planNameToMarketTier(plan!.name) : null;

  const planConfig =
    plan && PLAN_CONFIGS[plan.name as keyof typeof PLAN_CONFIGS] ? PLAN_CONFIGS[plan.name as keyof typeof PLAN_CONFIGS] : null;
  const PlanIcon = planConfig?.icon ?? Zap;

  const csvExportsUsed = usage?.exports_count || 0;
  const csvExportsLimit = plan?.max_monthly_exports || 0;
  const csvExportsPercent = csvExportsLimit === -1 ? 0 : Math.min(100, (csvExportsUsed / Math.max(1, csvExportsLimit)) * 100);

  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const formattedRenewal = periodEnd ? new Date(
    periodEnd.getFullYear(),
    periodEnd.getMonth(),
    periodEnd.getDate()
  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // ========== PAID PLAN VIEW ==========
  if (hasSubscriptionPlan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Your Plan & Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plan Info Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-background shadow-sm flex items-center justify-center flex-shrink-0">
                <PlanIcon className={cn("h-6 w-6", planConfig?.color ?? "text-brand")} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-lg">
                    {plan!.display_name}{ledgerBalance > 0 ? " + Bulk Credits" : ""}
                  </span>
                  {plan!.price_monthly_cents > 0 && (
                    <span className="text-muted-foreground">· ${(plan!.price_monthly_cents / 100).toFixed(0)}/month</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                  {subscription?.status === "active" && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                  )}
                  {subscription?.status === "past_due" && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Past due</Badge>
                  )}
                  {formattedRenewal && <span>Renews {formattedRenewal}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              {subscription?.stripe_subscription_id && (
                portalUnavailable ? (
                  <Button variant="outline" size="sm" className="gap-2" asChild>
                    <a href="mailto:hello@snapignite.com?subject=Billing%20Support">
                      <Mail className="h-4 w-4" />
                      Contact Support
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={portalLoading} className="gap-2">
                    {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Manage Subscription
                  </Button>
                )
              )}
              {plan!.name !== "enterprise" && plan!.name !== "enterprise_admin" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleCheckout("subscription", {
                    tier_name: plan!.name === "starter" ? "professional" : "enterprise",
                    billing_cycle: "monthly",
                  })}
                  disabled={!!checkoutLoading}
                >
                  {checkoutLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Upgrade
                </Button>
              )}
            </div>
          </div>

          {selectedMarketTier && <PlanTierStrip selected={selectedMarketTier} />}

          {/* Monthly Usage */}
          <div>
            <h4 className="font-medium text-sm text-muted-foreground mb-4">Monthly Usage</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Credits Used</span>
                <span className="font-medium">
                  {csvExportsUsed.toLocaleString()} / {csvExportsLimit === -1 ? '∞' : csvExportsLimit.toLocaleString()}
                </span>
              </div>
              {csvExportsLimit !== -1 && (
                <Progress value={csvExportsPercent} className="h-2" />
              )}
            </div>
          </div>

          {plan!.name !== "enterprise" && plan!.name !== "enterprise_admin" && (
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Change Plan</p>
              <div className="grid gap-2">
                {SUBSCRIPTION_TIERS.map((tier) => {
                  const Icon = tier.icon;
                  const isCurrentPlan = plan!.name === tier.name;
                  const key = `subscription-${JSON.stringify({ tier_name: tier.name, billing_cycle: "monthly" })}`;
                  return (
                    <Button
                      key={tier.name}
                      variant="outline"
                      onClick={() => handleCheckout("subscription", { tier_name: tier.name, billing_cycle: "monthly" })}
                      disabled={!!checkoutLoading || isCurrentPlan}
                      className="w-full justify-between gap-2 h-auto py-2.5 px-4"
                    >
                      <span className="flex items-center gap-2">
                        {isTargetLoading(key) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        <span className="font-medium">{tier.label}</span>
                        <span className="text-muted-foreground text-xs">{tier.credits}</span>
                      </span>
                      <span className="font-semibold text-sm">{isCurrentPlan ? "Current" : tier.price}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bulk Credits Balance */}
          {ledgerBalance > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <Coins className="h-5 w-5 text-amber-700" />
              <div>
                <p className="text-sm font-medium text-amber-900">Bulk Credits</p>
                <p className="text-xs text-amber-700">{ledgerBalance.toLocaleString()} credits remaining</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Bulk Credit Packs
            </p>
            <div className="grid gap-2">
              {BULK_PACKS.map((pack) => {
                const key = `bulk_credits-${JSON.stringify({ credit_count: pack.count })}`;
                return (
                  <Button
                    key={pack.count}
                    variant="outline"
                    onClick={() => handleCheckout("bulk_credits", { credit_count: pack.count })}
                    disabled={!!checkoutLoading}
                    className="w-full justify-between gap-2 h-auto py-2 px-4"
                    size="sm"
                  >
                    <span className="flex items-center gap-2">
                      {isTargetLoading(key) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Coins className="h-3.5 w-3.5" />
                      )}
                      <span className="font-medium">{pack.label}</span>
                      <span className="text-muted-foreground text-xs">{pack.per}</span>
                    </span>
                    <span className="font-semibold text-sm">{pack.price}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ========== FREE / BULK-ONLY VIEW ==========
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Your Plan & Usage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 py-2">
        {/* Plan Status */}
        <div className="text-center sm:text-left space-y-2">
          <div className="flex justify-center sm:justify-start">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Zap className="h-7 w-7 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-lg font-semibold">{ledgerBalance > 0 ? "Bulk Credits" : "Free Plan"}</h3>
          <p className="text-muted-foreground text-sm">
            {ledgerBalance > 0
              ? `You have ${ledgerBalance.toLocaleString()} bulk credits ready to use${freeUnlocksRemaining > 0 ? ` plus ${freeUnlocksRemaining} free unlock${freeUnlocksRemaining !== 1 ? 's' : ''}` : ''}.`
              : `You're on the Free Plan — you have ${freeUnlocksRemaining} free unlock${freeUnlocksRemaining !== 1 ? 's' : ''} to try.`}
            {" "}When you're ready to unlock more properties, pick a plan below or buy a one-time credit pack. No commitment required.
          </p>
        </div>

        {/* Credit Balances */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border">
            <Gift className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Free Unlocks</p>
              <p className="text-lg font-semibold">{freeUnlocksRemaining} / 3</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border">
            <Coins className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-xs text-muted-foreground">Bulk Credits</p>
              <p className="text-lg font-semibold">{ledgerBalance > 0 ? ledgerBalance.toLocaleString() : '0'}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Subscribe */}
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Subscribe & Save</p>
          <div className="grid gap-2">
            {SUBSCRIPTION_TIERS.map((tier) => {
              const Icon = tier.icon;
              const key = `subscription-${JSON.stringify({ tier_name: tier.name, billing_cycle: "monthly" })}`;
              return (
                <Button
                  key={tier.name}
                  variant="outline"
                  onClick={() => handleCheckout("subscription", { tier_name: tier.name, billing_cycle: "monthly" })}
                  disabled={!!checkoutLoading}
                  className="w-full justify-between gap-2 h-auto py-2.5 px-4"
                >
                  <span className="flex items-center gap-2">
                    {isTargetLoading(key) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                    <span className="font-medium">{tier.label}</span>
                    <span className="text-muted-foreground text-xs">{tier.credits}</span>
                  </span>
                  <span className="font-semibold text-sm">{tier.price}</span>
                </Button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Bulk Credit Packs */}
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Bulk Credit Packs
          </p>
          <div className="grid gap-2">
            {BULK_PACKS.map((pack) => {
              const key = `bulk_credits-${JSON.stringify({ credit_count: pack.count })}`;
              return (
                <Button
                  key={pack.count}
                  variant="outline"
                  onClick={() => handleCheckout("bulk_credits", { credit_count: pack.count })}
                  disabled={!!checkoutLoading}
                  className="w-full justify-between gap-2 h-auto py-2 px-4"
                  size="sm"
                >
                  <span className="flex items-center gap-2">
                    {isTargetLoading(key) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Coins className="h-3.5 w-3.5" />
                    )}
                    <span className="font-medium">{pack.label}</span>
                    <span className="text-muted-foreground text-xs">{pack.per}</span>
                  </span>
                  <span className="font-semibold text-sm">{pack.price}</span>
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Need 25,000+ credits? <a href="mailto:hello@snapignite.com" className="underline">Contact us</a> for enterprise pricing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
