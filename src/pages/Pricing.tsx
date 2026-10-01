import { useState, useRef, useEffect } from "react";
import SEOHead from "@/components/SEOHead";
import AvailabilityNotice from "@/components/AvailabilityNotice";
import { CHECKOUT_AVAILABLE, FREE_ACCOUNT_MESSAGE } from "@/lib/publicAvailability";
import { PAYG_PRICE_PER_CREDIT, subscriptionSavings } from "@/lib/pricing";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, TrendingUp, Building2, ArrowRight, Droplets, Loader2, Crown, Shield, Sparkles, Users, type LucideIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface PricingTier {
  id: string;
  name: string;
  display_name: string;
  price: number | null; // null = custom
  perAddress?: string;
  description: string;
  features: string[];
  notIncluded?: string[];
  icon: LucideIcon;
  popular?: boolean;
  badge?: string;
  savingsBadge?: string;
  cta: string;
  isPayg?: boolean;
  isFree?: boolean;
  isEnterprise?: boolean;
  borderClass?: string;
  footnote?: string;
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "free",
    display_name: "Free",
    price: 0,
    description: "Create an account while customer access is being verified.",
    features: [
      "No paid trial or card required",
      "Customer record access paused",
      "Free unlocks paused",
      "Exports paused",
    ],
    icon: Users,
    cta: "Create Free Account",
    isFree: true,
    footnote: undefined,
  },
  {
    id: "payg",
    name: "payg",
    display_name: "Pay As You Go",
    price: PAYG_PRICE_PER_CREDIT,
    perAddress: "$0.67/credit",
    description: "For selective unlocks when a signal is strong enough to act.",
    features: [
      "$0.67 per credit",
      "Intended allowance: 1 unlock + export per credit",
      "Purchases paused during verification",
      "No subscription required",
      "Market availability must be confirmed",
    ],
    icon: Zap,
    cta: "Buy Credits",
    isPayg: true,
    borderClass: "border-amber-500 dark:border-amber-400",
    footnote: undefined,
  },
  {
    id: "starter",
    name: "starter",
    display_name: "Starter",
    price: 49,
    perAddress: "$0.07/address",
    description: "For investors starting a recurring market-monitoring habit.",
    features: [
      "750 credits/month when available",
      "Unlocks and exports paused",
      "All Free features",
      "Code violation monitoring",
      "Basic market filters",
    ],
    icon: Zap,
    cta: "Get Starter",
    footnote: undefined,
  },
  {
    id: "professional",
    name: "professional",
    display_name: "Pro",
    price: 99,
    perAddress: "$0.07/address",
    description: "For operators reviewing municipal pressure signals every week.",
    features: [
      "1,500 credits/month when available",
      "Unlocks and exports paused",
      "All Starter features",
      "Pressure Level™ filters",
      "Weekly monitoring workflow",
    ],
    icon: TrendingUp,
    popular: true,
    badge: "Pro",
    savingsBadge: `At full use: $${subscriptionSavings(1500, 99).toLocaleString("en-US")} vs PAYG`,
    cta: "Get Pro",
    footnote: undefined,
  },
  {
    id: "enterprise",
    name: "enterprise",
    display_name: "Elite",
    price: 199,
    perAddress: "$0.07/address",
    description: "Reference allowance for teams. Market and signal availability must be confirmed.",
    features: [
      "3,000 credits/month when available",
      "Unlocks and exports paused",
      "All Pro features",
      "Signal coverage depends on the released market",
      "Market availability must be confirmed",
      "Contact us with support questions",
    ],
    icon: Building2,
    savingsBadge: `At full use: $${subscriptionSavings(3000, 199).toLocaleString("en-US")} vs PAYG`,
    cta: "Get Elite",
    footnote: undefined,
  },
  {
    id: "custom",
    name: "custom",
    display_name: "Enterprise",
    price: null,
    description: "Discuss data and workflow requirements. No coverage or integration is promised before a separate agreement.",
    features: [
      "Discuss required record volume",
      "Discuss integration requirements",
      "Discuss support requirements",
      "Custom contract",
      "Availability confirmed before any agreement",
      "Discuss onboarding needs",
      "Service terms require a separate agreement",
    ],
    icon: Shield,
    cta: "Contact Us",
    isEnterprise: true,
    footnote: undefined,
  },
];

const BULK_PACKS = [
  { credits: "5,000", rawCount: 5000, price: "$750", per: "$0.15/credit" },
  { credits: "10,000", rawCount: 10000, price: "$1,300", per: "$0.13/credit" },
  { credits: "20,000", rawCount: 20000, price: "$2,200", per: "$0.11/credit" },
];

function BulkCreditCards({ user, navigate, toast }: { user: User | null; navigate: NavigateFunction; toast: ReturnType<typeof useToast>["toast"] }) {
  const [loadingPack, setLoadingPack] = useState<number | null>(null);

  const handleBuy = async (rawCount: number) => {
    if (!CHECKOUT_AVAILABLE) return;
    if (!user) {
      navigate("/auth?mode=signup");
      return;
    }
    setLoadingPack(rawCount);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("create-checkout-session", {
        body: { checkout_type: "bulk_credits", credit_count: rawCount },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message || "Checkout failed");
      const url = res.data?.url || res.data?.checkout_url;
      if (!url) throw new Error(res.data?.error || "Failed to create checkout");
      // Use direct navigation on mobile to avoid popup blockers
      window.location.href = url;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Checkout failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoadingPack(null);
    }
  };

  return (
    <div className="grid sm:grid-cols-3 gap-6">
      {BULK_PACKS.map((pkg) => (
        <Card key={pkg.credits} className="text-center border-border hover:shadow-lg transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl">{pkg.credits} Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-1">{pkg.price}</div>
            <div className="text-sm text-muted-foreground mb-4">{pkg.per}</div>
            <Button
              onClick={() => handleBuy(pkg.rawCount)}
              disabled={!CHECKOUT_AVAILABLE || loadingPack === pkg.rawCount}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white"
              size="lg"
            >
              {loadingPack === pkg.rawCount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {CHECKOUT_AVAILABLE ? "Buy Now" : "Purchases paused"} <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
export default function Pricing() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { subscription, hasActiveSubscription: hasPaidSubscription, refetch: refetchSubscription } = useSubscription();

  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const [checkoutFallbackUrl, setCheckoutFallbackUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const upgradeInFlightRef = useRef(false);

  useEffect(() => {
    refetchSubscription();
  }, [refetchSubscription]);

  const isActivePaid = hasPaidSubscription && subscription?.status === 'active';
  const activePlanName = subscription?.plan_name;

  const handleDirectUpgrade = async (tierName: string) => {
    if (!CHECKOUT_AVAILABLE) return;
    if (upgradeInFlightRef.current) return;
    upgradeInFlightRef.current = true;
    setUpgradingTier(tierName);
    setCheckoutFallbackUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { tier_name: tierName, billing_cycle: 'monthly' },
      });
      if (error) throw error;

      if (data?.upgraded) {
        toast({ title: 'Plan updated', description: data.message || 'Your subscription is updated.' });
        const rUrl = data.redirect_url || `${window.location.origin}/checkout/success`;
        window.location.href = rUrl;
        return;
      }

      const checkoutUrl = data?.url || data?.checkout_url;
      if (!checkoutUrl) throw new Error('No checkout URL returned');

      setCheckoutFallbackUrl(checkoutUrl);
      // Use direct navigation to avoid mobile popup blockers
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      console.error('[Pricing] Upgrade error:', err);
      const message = err instanceof Error ? err.message : 'Please try again.';
      toast({ title: 'Unable to start checkout', description: message, variant: 'destructive' });
      setUpgradingTier(null);
      upgradeInFlightRef.current = false;
    }
  };

  const handlePlanClick = (tier: PricingTier) => {
    if (tier.isFree) {
      navigate('/auth?mode=signup');
      return;
    }
    if (tier.isEnterprise) {
      window.location.href = 'mailto:hello@snapignite.com?subject=Enterprise%20Plan%20Inquiry';
      return;
    }
    if (!CHECKOUT_AVAILABLE) return;
    if (tier.isPayg) {
      // Navigate to leads where they can buy individual addresses
      if (!user) {
        navigate('/auth?mode=signin');
      } else {
        navigate('/leads');
      }
      return;
    }
    if (isActivePaid && activePlanName === tier.name) {
      navigate('/settings');
      return;
    }
    if (!user) {
      navigate(`/auth?mode=signup&plan=${encodeURIComponent(tier.name)}`);
      return;
    }
    handleDirectUpgrade(tier.name);
  };

  const isCurrentPlan = (tierName: string) => {
    if (isActivePaid) return tierName === activePlanName;
    return false;
  };

  const renderPlanCard = (tier: PricingTier) => {
    const Icon = tier.icon;
    const isUpgrading = upgradingTier === tier.name;
    const isCurrent = isCurrentPlan(tier.name);

    return (
      <Card
        key={tier.id}
        className={`relative flex flex-col transition-all hover:shadow-xl ${
          isCurrent
            ? "border-cyan-500 border-2 shadow-lg ring-2 ring-cyan-500/20"
            : tier.popular
              ? "border-primary border-2 shadow-lg"
              : tier.isPayg
                ? `border-2 ${tier.borderClass}`
                : "border-border"
        }`}
      >
        {isCurrent && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <span className="bg-gradient-to-r from-cyan-600 to-teal-600 text-white px-4 py-1.5 rounded-full text-sm font-semibold shadow-md flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5" />
              Your Current Plan
            </span>
          </div>
        )}
        {!isCurrent && tier.badge && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-md">
              ⭐ {tier.badge}
            </span>
          </div>
        )}
        {tier.isPayg && !isCurrent && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <span className="bg-amber-500 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-md">
              No Subscription Needed
            </span>
          </div>
        )}

        <CardHeader className="pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-3 rounded-lg ${
              tier.popular ? "bg-gradient-to-br from-blue-500 to-purple-500" :
              tier.isPayg ? "bg-amber-500/20" :
              "bg-muted"
            }`}>
              <Icon className={`w-5 h-5 ${
                tier.popular ? "text-white" : tier.isPayg ? "text-amber-600" : "text-primary"
              }`} />
            </div>
            <CardTitle className="text-xl">{tier.display_name}</CardTitle>
          </div>
          <CardDescription>{tier.description}</CardDescription>

          <div className="mt-4">
            {tier.price === null ? (
              <div className="text-3xl font-bold">Custom</div>
            ) : tier.isFree ? (
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-muted-foreground">/forever</span>
              </div>
            ) : tier.isPayg ? (
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">$0.67</span>
                  <span className="text-muted-foreground">/credit</span>
                </div>
                <div className="text-xs font-medium text-muted-foreground mt-1">Data Only</div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">${tier.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {tier.perAddress && (
                  <div className="text-sm text-muted-foreground mt-1">{tier.perAddress} effective</div>
                )}
              </>
            )}
          </div>

          {tier.savingsBadge && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold">
              <Sparkles className="w-3 h-3" />
              {tier.savingsBadge}
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          <Button
            onClick={() => handlePlanClick(tier)}
            disabled={isUpgrading || (isActivePaid && isCurrent) || (!CHECKOUT_AVAILABLE && !tier.isFree && !tier.isEnterprise)}
            className={`w-full mb-2 ${
              tier.popular
                ? "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
                : "bg-teal-500 hover:bg-teal-600 text-white"
            }`}
            variant="default"
            size="lg"
          >
            {isUpgrading ? (
              <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Redirecting…</>
            ) : isCurrent ? (
              'Your Active Plan'
            ) : (
              !CHECKOUT_AVAILABLE && !tier.isFree && !tier.isEnterprise ? "Purchases paused" : tier.cta
            )}
            {!isUpgrading && !isCurrent && <ArrowRight className="ml-2 w-4 h-4" />}
          </Button>

          {isUpgrading && checkoutFallbackUrl && (
            <a href={checkoutFallbackUrl} target="_blank" rel="noopener noreferrer" className="block text-center text-sm text-primary underline mt-1 mb-2">
              Tap here if you're not redirected
            </a>
          )}

          <ul className="space-y-2.5 mt-4 flex-1">
            {tier.features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <span className="text-sm">{feature}</span>
              </li>
            ))}
            {!tier.isEnterprise && (
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                <span className="text-sm text-muted-foreground/60 italic">Owner Contact Enrichment — Unavailable</span>
              </li>
            )}
          </ul>

          {tier.isPayg && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-semibold">
              <Sparkles className="w-3 h-3" />
              Owner Contact Enrichment — Unavailable
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <SEOHead
        title="Plan Pricing — Purchases Paused | Snap Ignite"
        description="View configured Snap Ignite prices. Customer record access, unlocks, exports, and new purchases are paused during relaunch verification."
        canonical="https://snapignite.com/pricing"
      />

      {user && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800">
          <div className="container max-w-7xl py-3 px-4 flex items-center justify-center gap-2 text-sm">
            <span className="text-blue-700 dark:text-blue-300">
              Signed in as <span className="font-medium">{user.email}</span>
            </span>
            <span className="text-blue-400 dark:text-blue-600">|</span>
            <button onClick={() => signOut()} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Not you? Sign out
            </button>
          </div>
        </div>
      )}

      {isActivePaid && activePlanName && (
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-950 text-white">
          <div className="container max-w-4xl py-10 px-4 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              Active Subscription
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              You're on the {activePlanName === 'professional' ? 'Pro' : activePlanName === 'enterprise' ? 'Elite' : 'Starter'} plan
            </h1>
            <p className="text-lg text-emerald-100/80 mb-8 max-w-2xl mx-auto">
              Review your existing subscription in account settings. New purchases and plan changes are paused.
            </p>
            <Button
              onClick={() => navigate('/settings')}
              size="lg"
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-lg px-10 py-6 rounded-xl shadow-xl shadow-emerald-500/25"
            >
              Manage Subscription <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      )}

      <div className="container max-w-7xl py-12 px-4">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent leading-tight">
            Plan reference — purchases paused
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            Configured plan prices are shown for reference. A plan allowance does not establish available market coverage.
          </p>
        </div>

        <AvailabilityNotice className="mb-10" />
        <p className="text-center text-sm text-muted-foreground mb-8">Savings compare the complete monthly allowance at $0.67 per credit with the monthly plan fee. They assume every credit is used; they do not promise record availability.</p>

        {/* 6-tier grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {PRICING_TIERS.map((tier) => renderPlanCard(tier))}
        </div>

        {/* Bulk Credits Section */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">
            Bulk credit reference prices
          </h2>
          <p className="text-center text-muted-foreground mb-2">No subscription required.</p>
          <p className="text-center text-sm text-muted-foreground mb-8">The intended allowance is one unlock and export per credit. These actions and new credit purchases are currently paused.</p>
          <BulkCreditCards user={user} navigate={navigate} toast={toast} />
          <p className="text-center text-sm text-muted-foreground mt-4">
            Need 25,000+? <a href="mailto:hello@snapignite.com?subject=Enterprise%20Pricing%20Inquiry" className="text-primary hover:underline">Contact us</a> for Enterprise pricing.
          </p>
        </div>

        {/* Water shutoff callout */}
        <div className="max-w-3xl mx-auto mb-16">
          <Card className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border-cyan-200 dark:border-cyan-800">
            <CardHeader>
              <div className="flex items-center gap-3 justify-center">
                <Droplets className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
                <CardTitle className="text-2xl text-center">Signal availability varies by source</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground">
                Utility records can add research context, but do not establish owner intent, vacancy, or financial distress. No water shutoff dataset is currently promised for customer access.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">Do I need a subscription?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {FREE_ACCOUNT_MESSAGE} Customer records remain paused; no paid plan is needed to create an account.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">How does Pay As You Go work?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  The configured reference price is $0.67 per credit. The intended allowance is one property unlock and export. Purchases, unlocks, and exports remain paused.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">What's the difference between code violations and water shutoffs?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  <strong>Code violations</strong> indicate properties with visible municipal enforcement activity.
                  <strong> Water shutoffs</strong> are utility disconnections with several possible explanations. Availability is source-specific and is not currently promised on any plan.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Can I change tiers later?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  New purchases and plan changes are paused. Existing customers can use account settings to review their billing or contact support about cancellation.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="text-center mt-16">
          <p className="text-sm text-muted-foreground mb-6 italic">
            All prices and intended allowances above are reference information while access is paused. A record or AI summary does not establish an owner’s willingness to sell.
          </p>
          <p className="text-muted-foreground mb-4">
            Questions? Email us at <a href="mailto:hello@snapignite.com" className="text-blue-600 dark:text-blue-400 hover:underline">hello@snapignite.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
