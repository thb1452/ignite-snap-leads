import { useState, useRef, useEffect } from "react";
import SEOHead from "@/components/SEOHead";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Zap, TrendingUp, Building2, ArrowRight, Droplets, Loader2, Crown, Shield, AlertTriangle, Sparkles, Users, Mail } from "lucide-react";

import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";

interface PricingTier {
  id: string;
  name: string;
  display_name: string;
  price: number | null; // null = custom
  perAddress?: string;
  description: string;
  features: string[];
  notIncluded?: string[];
  icon: any;
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
    description: "Browse everything. Pay nothing.",
    features: [
      "3 free unlocks on signup",
      "Browse all properties",
      "AI investor briefs",
      "SnapScore ranking",
      "Violation data",
      "Address always blurred until unlock",
    ],
    icon: Users,
    cta: "Start Free — No Credit Card Required",
    isFree: true,
    footnote: undefined,
  },
  {
    id: "payg",
    name: "payg",
    display_name: "Pay As You Go",
    price: 0.67,
    perAddress: "$0.67/credit",
    description: "No monthly fee. No commitment.",
    features: [
      "$0.67 per credit",
      "1 credit = 1 unlock + export",
      "Credits never expire",
      "No subscription required",
      "Perfect for thin markets",
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
    description: "For investors getting started with enforcement data.",
    features: [
      "750 credits/month",
      "1 credit = 1 unlock + export",
      "All Free features",
      "Code violation data",
      "Basic filters",
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
    description: "For serious operators stacking enforcement data.",
    features: [
      "1,500 credits/month",
      "1 credit = 1 unlock + export",
      "All Starter features",
      "Pressure Level™ filters",
      "Priority support",
    ],
    icon: TrendingUp,
    popular: true,
    badge: "Most Popular",
    savingsBadge: "Save $553 vs Pay As You Go",
    cta: "Get Pro",
    footnote: undefined,
  },
  {
    id: "enterprise",
    name: "enterprise",
    display_name: "Elite",
    price: 199,
    perAddress: "$0.07/address",
    description: "For teams running enforcement-first strategies.",
    features: [
      "3,000 credits/month",
      "1 credit = 1 unlock + export",
      "All Pro features",
      "Water shutoff data",
      "API Access",
      "Priority support",
    ],
    icon: Building2,
    savingsBadge: "Save $1,812 vs Pay As You Go",
    cta: "Get Elite",
    footnote: undefined,
  },
  {
    id: "custom",
    name: "custom",
    display_name: "Enterprise",
    price: null,
    description: "For teams, funds, and high-volume operators. Custom pricing, API access, and dedicated support.",
    features: [
      "25,000+ addresses",
      "API access",
      "Dedicated account manager",
      "Custom contract",
      "Custom rate limits",
      "Dedicated onboarding",
      "SLA guarantee",
    ],
    icon: Shield,
    cta: "Contact Us",
    isEnterprise: true,
    footnote: undefined,
  },
];

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
        toast({ title: 'Subscription activated!', description: 'Your plan is now active.' });
        navigate('/properties?checkout=success', { replace: true });
        return;
      }

      const checkoutUrl = data?.url || data?.checkout_url;
      if (!checkoutUrl) throw new Error('No checkout URL returned');

      setCheckoutFallbackUrl(checkoutUrl);
      window.location.assign(checkoutUrl);

      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          setUpgradingTier(null);
          upgradeInFlightRef.current = false;
        }
      }, 3000);
    } catch (err: any) {
      console.error('[Pricing] Upgrade error:', err);
      toast({ title: 'Unable to start checkout', description: err.message || 'Please try again.', variant: 'destructive' });
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
    if (tier.isPayg) {
      // Navigate to leads where they can buy individual addresses
      if (!user) {
        navigate('/auth?mode=signup');
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
            disabled={isUpgrading || (isActivePaid && isCurrent)}
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
              tier.cta
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
            {!tier.isFree && !tier.isEnterprise && (
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                <span className="text-sm text-muted-foreground/60 italic">Skip Trace — Coming Soon</span>
              </li>
            )}
          </ul>

          {tier.isPayg && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-semibold">
              <Sparkles className="w-3 h-3" />
              Skip Trace Coming Soon
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <SEOHead
        title="Pricing — Plans from $0.67/credit | Snap Ignite"
        description="Choose your Snap Ignite plan. Free forever, Pay As You Go ($0.67/credit), Starter ($49/mo), Pro ($99/mo), or Elite ($199/mo). One deal pays for years of Snap Ignite."
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
              Your subscription is active. Manage billing or switch plans below.
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
            Our competitor sells raw code violation CSVs. We show you which ones to call first and why.
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            Only pay for what's in your market. One deal pays for years of Snap Ignite.
          </p>
        </div>

        {/* 6-tier grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {PRICING_TIERS.map((tier) => renderPlanCard(tier))}
        </div>

        {/* Bulk Credits Section */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">
            Need a large targeted list? Buy once, use anytime.
          </h2>
          <p className="text-center text-muted-foreground mb-2">No subscription required.</p>
          <p className="text-center text-sm text-muted-foreground mb-8">Each credit unlocks one full property record including address and violation data.</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { credits: "5,000", price: "$750", per: "$0.15/credit" },
              { credits: "10,000", price: "$1,300", per: "$0.13/credit" },
              { credits: "20,000", price: "$2,200", per: "$0.11/credit" },
            ].map((pkg) => (
              <Card key={pkg.credits} className="text-center border-border hover:shadow-lg transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-2xl">{pkg.credits} Credits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold mb-1">{pkg.price}</div>
                  <div className="text-sm text-muted-foreground mb-4">{pkg.per}</div>
                  <Button
                    onClick={() => window.location.href = 'mailto:hello@snapignite.com?subject=Bulk%20Credits%20Inquiry%20-%20' + pkg.credits}
                    className="w-full bg-teal-500 hover:bg-teal-600 text-white"
                    size="lg"
                  >
                    Get {pkg.credits} Credits <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
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
                <CardTitle className="text-2xl text-center">Why Water Shutoffs Matter</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground">
                Water shutoffs represent the highest level of municipal enforcement pressure on a property.
                This premium data is available exclusively on the Elite plan.
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
                  No. Browse everything free. When you find a lead worth pursuing, unlock it for $0.67 — no subscription required.
                  Subscriptions give you a better per-address rate if you're unlocking regularly.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">How does Pay As You Go work?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Buy credits one at a time for $0.67 each. Each credit unlocks one property — full address + violation data.
                  No monthly commitment, no expiration.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">What's the difference between code violations and water shutoffs?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  <strong>Code violations</strong> indicate properties where the city is applying enforcement pressure.
                  <strong> Water shutoffs</strong> are utility disconnections — a stronger enforcement signal.
                  Water shutoff data is available on the Elite plan.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Can I change tiers later?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes! Upgrade or downgrade anytime. Upgrades take effect immediately with prorated billing.
                  Downgrades take effect at your next billing cycle.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="text-center mt-16">
          <p className="text-sm text-muted-foreground mb-6 italic">
            Each credit unlocks one full property record including address and violation data. Skip trace (owner phone/contact) coming soon.
          </p>
          <p className="text-muted-foreground mb-4">
            Questions? Email us at <a href="mailto:hello@snapignite.com" className="text-blue-600 dark:text-blue-400 hover:underline">hello@snapignite.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
