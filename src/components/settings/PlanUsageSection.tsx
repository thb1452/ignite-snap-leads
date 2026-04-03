import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useUserCredits } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Loader2, Crown, Zap, Sparkles, TrendingUp, List, Mail, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PlanTierName } from "@/types/subscription";

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

interface PlanUsageSectionProps {
  listsCount?: number;
  propertiesCount?: number;
}

export function PlanUsageSection({ listsCount = 0, propertiesCount = 0 }: PlanUsageSectionProps) {
  const { subscription, plan, usage, loading: subscriptionLoading } = useSubscription();
  const { data: creditBalance = 0, isLoading: creditsLoading } = useUserCredits();
  const { isOnTrial, trialExportsUsed, trialExportsLimit } = useTrialStatus();
  const loading = subscriptionLoading || creditsLoading;
  const { toast } = useToast();
  const navigate = useNavigate();
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

  const handleUpgrade = async (tierName: string) => {
    try {
      setCheckoutLoading(tierName);

      const { data, error: fnError } = await supabase.functions.invoke('create-checkout-session', {
        body: { tier_name: tierName, billing_cycle: 'monthly' },
      });

      if (fnError) throw new Error(fnError.message || "Failed to create checkout session");

      if (data?.upgraded) {
        const rUrl = data.redirect_url || `${window.location.origin}/checkout/success`;
        const w = window.open(rUrl, '_blank'); if (!w) window.location.href = rUrl;
        return;
      }

      const checkoutUrl = data?.url || data?.checkout_url;
      if (!checkoutUrl) throw new Error("No checkout URL returned. Please try again.");

      const w = window.open(checkoutUrl, '_blank'); if (!w) window.location.href = checkoutUrl;
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

  // Only show trial export counts if user is on trial AND doesn't have a paid plan
  const isPaidPlan = subscription && !['trial', 'trialing'].includes(subscription.status);
  const showTrialUsage = isOnTrial && !isPaidPlan;
  const csvExportsUsed = showTrialUsage ? trialExportsUsed : (usage?.exports_count || 0);
  const csvExportsLimit = showTrialUsage ? trialExportsLimit : (plan?.max_monthly_exports || 0);
  const csvExportsPercent = csvExportsLimit === -1 ? 0 : Math.min(100, (csvExportsUsed / Math.max(1, csvExportsLimit)) * 100);

  // Use local date components to avoid timezone shift showing past dates
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const formattedRenewal = periodEnd ? new Date(
    periodEnd.getFullYear(),
    periodEnd.getMonth(),
    periodEnd.getDate()
  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // No subscription from backend: bulk credits only or free — never infer a tier
  if (!hasSubscriptionPlan) {
    const usingBulkCredits = creditBalance > 0;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Your Plan & Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 py-2">
          <div className="text-center sm:text-left space-y-2">
            {usingBulkCredits ? (
              <>
                <div className="flex justify-center sm:justify-start">
                  <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
                    <Coins className="h-7 w-7 text-amber-700" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold">Using Bulk Credits</h3>
                <p className="text-muted-foreground">
                  {creditBalance.toLocaleString()} remaining — each credit unlocks one property. Subscribe for monthly
                  credits and advanced features.
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-center sm:justify-start">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <Zap className="h-7 w-7 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold">Free Plan</h3>
                <p className="text-muted-foreground">
                  Browse and explore at no cost. Subscribe or buy credits when you are ready to unlock addresses.
                </p>
              </>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-3 text-center sm:text-left">Subscribe (monthly)</p>
            <div className="flex gap-3 justify-center sm:justify-start flex-wrap">
              <Button
                onClick={() => handleUpgrade('starter')}
                variant="outline"
                disabled={!!checkoutLoading}
                className="min-w-[9rem]"
              >
                {checkoutLoading === 'starter' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Starter — $49/mo
              </Button>
              <Button
                onClick={() => handleUpgrade('professional')}
                variant="outline"
                disabled={!!checkoutLoading}
                className="min-w-[9rem]"
              >
                {checkoutLoading === 'professional' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Pro — $99/mo
              </Button>
              <Button
                onClick={() => handleUpgrade('enterprise')}
                variant="outline"
                disabled={!!checkoutLoading}
                className="min-w-[9rem]"
              >
                {checkoutLoading === 'enterprise' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Elite — $199/mo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Your Plan & Usage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan Info Row — display_name comes from backend subscription */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-background shadow-sm flex items-center justify-center flex-shrink-0">
              <PlanIcon className={cn("h-6 w-6", planConfig?.color ?? "text-brand")} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-lg">{plan.display_name}</span>
                {plan.price_monthly_cents > 0 && (
                  <span className="text-muted-foreground">· ${(plan.price_monthly_cents / 100).toFixed(0)}/month</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                {subscription?.status === "active" && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                )}
                {subscription?.status === "past_due" && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                    Past due
                  </Badge>
                )}
                {(subscription?.status === "trial" || subscription?.status === "trialing") && (
                  <Badge variant="outline" className="bg-cyan-50 text-cyan-800 border-cyan-200">
                    Trial
                  </Badge>
                )}
                {formattedRenewal && <span>Renews {formattedRenewal}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {subscription?.stripe_subscription_id && (
              portalUnavailable ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  asChild
                >
                  <a href="mailto:hello@snapignite.com?subject=Billing%20Support">
                    <Mail className="h-4 w-4" />
                    Contact Support to Manage Billing
                  </a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="gap-2"
                >
                  {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Manage Subscription
                </Button>
              )
            )}
            {plan.name !== "enterprise" && plan.name !== "enterprise_admin" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleUpgrade(plan.name === "starter" ? "professional" : "enterprise")}
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
          <div className="space-y-4">
            {/* CSV Exports Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>CSV Exports</span>
                <span className="font-medium">
                  {csvExportsUsed.toLocaleString()} / {csvExportsLimit === -1 ? '∞' : csvExportsLimit.toLocaleString()}
                </span>
              </div>
              {csvExportsLimit !== -1 && (
                <Progress value={csvExportsPercent} className="h-2" />
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-4 pt-2">
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <List className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Lists Created</p>
                  <p className="text-lg font-semibold">{listsCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
