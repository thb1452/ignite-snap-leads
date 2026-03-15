import { useState, useRef, useEffect } from "react";
import SEOHead from "@/components/SEOHead";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Zap, TrendingUp, Building2, ArrowRight, Droplets, Clock, Loader2, Crown, Shield, AlertTriangle, Lock, Sparkles } from "lucide-react";
import { TrialSignupModal } from "@/components/trial/TrialSignupModal";

import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SESSION_KEY_PRE_AUTH_USER = 'snap_pre_auth_user_existed';

interface PricingTier {
  id: string;
  name: string;
  display_name: string;
  price_monthly_cents: number;
  
  description: string;
  features: string[];
  notIncluded?: string[];
  icon: any;
  popular?: boolean;
  scanLine?: string;
  scanDisabled?: boolean;
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'starter',
    display_name: 'Starter',
    price_monthly_cents: 7900,
    
    description: 'For investors who want premium enforcement targeting',
    features: [
      '5,000 property exports/month',
      '3,800+ cities nationwide',
      'Code violation data',
      'Monthly data refresh',
      'Email support',
    ],
    scanLine: 'Scan — Upload your own list & see violations (Pro & above)',
    scanDisabled: true,
    notIncluded: ['No Pressure Level™ filters', 'No water shutoff data'],
    icon: Zap,
    popular: true,
  },
  {
    id: 'professional',
    name: 'professional',
    display_name: 'Pro',
    price_monthly_cents: 14900,

    description: 'For serious operators stacking enforcement data',
    features: [
      '15,000 property exports/month',
      '3,800+ cities nationwide',
      'Code violation data',
      'Everything in Starter',
      'Pressure Level™ filters',
      'Priority email support',
    ],
    scanLine: 'Scan — Upload your own list & see violations (50,000 rows/month) — Coming Soon',
    scanDisabled: false,
    notIncluded: ['No water shutoff data'],
    icon: TrendingUp,
  },
  {
    id: 'enterprise',
    name: 'enterprise',
    display_name: 'Elite',
    price_monthly_cents: 29900,

    description: 'For teams running enforcement-first strategies.',
    features: [
      '25,000 property exports/month',
      'All Pro features',
      'Water shutoff data',
    ],
    scanLine: 'Scan — Upload your own list & see violations (Unlimited rows) — Coming Soon',
    scanDisabled: false,
    icon: Building2,
  },
];

// Map trial tier DB names to display names
const TRIAL_TIER_DISPLAY: Record<string, string> = {
  starter: 'Starter',
  professional: 'Pro',
  enterprise: 'Elite',
};

// Map trial tier to the matching PRICING_TIERS name
const TRIAL_TIER_MAP: Record<string, string> = {
  starter: 'starter',
  professional: 'professional',
  enterprise: 'enterprise',
};

export default function Pricing() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isOnTrial, hasTrialExpired, trialDaysRemaining, trialExportsRemaining, trialTier, hasActiveSubscription: hasTrialActive, subscriptionStatus } = useTrialStatus();
  const { subscription, hasActiveSubscription: hasPaidSubscription, refetch: refetchSubscription } = useSubscription();
  
  const billingCycle = "monthly" as const;
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [selectedTrialTier, setSelectedTrialTier] = useState('starter');
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const [downgradeConfirm, setDowngradeConfirm] = useState<PricingTier | null>(null);
  const [checkoutFallbackUrl, setCheckoutFallbackUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const upgradeInFlightRef = useRef(false);

  // Refetch subscription on mount to ensure fresh data (e.g. after returning from Stripe)
  useEffect(() => {
    refetchSubscription();
  }, [refetchSubscription]);

  // Detect active PAID subscription (not trialing)
  const isActivePaid = hasPaidSubscription && subscription?.status === 'active';
  const activePlanName = subscription?.plan_name; // e.g. 'enterprise', 'starter', 'professional'

  // Has user already used a trial? (expired or currently on trial)
  const hasUsedTrial = isOnTrial || hasTrialExpired;

  const openTrialModal = (tier: string) => {
    setSelectedTrialTier(tier);
    setTrialModalOpen(true);
  };

  const handleDirectUpgrade = async (tierName: string) => {
    // Prevent double-clicks with a synchronous ref guard
    if (upgradeInFlightRef.current) return;
    upgradeInFlightRef.current = true;
    setUpgradingTier(tierName);
    setCheckoutFallbackUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { tier_name: tierName, billing_cycle: billingCycle },
      });
      if (error) throw error;

      // If trial was converted directly (no new checkout needed)
      if (data?.upgraded) {
        toast({ title: 'Subscription activated!', description: 'Your plan is now active.' });
        navigate('/properties?checkout=success', { replace: true });
        return;
      }

      const checkoutUrl = data?.url || data?.checkout_url;
      if (!checkoutUrl) {
        throw new Error('No checkout URL returned');
      }

      // Try redirect; show fallback link if it doesn't navigate within 2s
      setCheckoutFallbackUrl(checkoutUrl);
      window.location.assign(checkoutUrl);

      // If still on page after 2s, the redirect was blocked (iframe/popup blocker)
      setTimeout(() => {
        // Only reset if we're still on this page
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

  const handleSignOut = async () => {
    await signOut();
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toLocaleString()}`;

  const getMonthlyPrice = (tier: PricingTier) => {
    return formatPrice(tier.price_monthly_cents);
  };

  // Find the user's current trial tier object
  const currentTrialTierName = trialTier ? TRIAL_TIER_MAP[trialTier] : null;
  const currentTrialTierObj = PRICING_TIERS.find(t => t.name === currentTrialTierName);
  const trialTierDisplayName = trialTier ? TRIAL_TIER_DISPLAY[trialTier] || trialTier : '';

  // Tier hierarchy for downgrade detection
  const TIER_RANK: Record<string, number> = { starter: 1, professional: 2, enterprise: 3 };
  const isDowngrade = (targetTierName: string) => {
    if (!isOnTrial || !currentTrialTierName) return false;
    return (TIER_RANK[targetTierName] || 0) < (TIER_RANK[currentTrialTierName] || 0);
  };

  const handlePlanClick = (tier: PricingTier) => {
    // If user already has an active paid subscription for this tier, go to settings
    if (isActivePaid && activePlanName === tier.name) {
      navigate('/settings');
      return;
    }
    if (isOnTrial) {
      if (isDowngrade(tier.name)) {
        setDowngradeConfirm(tier);
      } else {
        handleDirectUpgrade(tier.name);
      }
    } else if (isActivePaid) {
      // Active paid user switching tiers
      handleDirectUpgrade(tier.name);
    } else if (hasUsedTrial) {
      // User already used a trial — go directly to checkout (no new trial)
      handleDirectUpgrade(tier.name);
    } else {
      openTrialModal(tier.name);
    }
  };

  // For trial/active users, reorder tiers: current plan first
  const getOrderedTiers = () => {
    const currentName = isOnTrial ? currentTrialTierName : (isActivePaid ? activePlanName : null);
    if (!currentName) return PRICING_TIERS;
    const current = PRICING_TIERS.find(t => t.name === currentName);
    const others = PRICING_TIERS.filter(t => t.name !== currentName);
    return current ? [current, ...others] : PRICING_TIERS;
  };

  const isCurrentPlan = (tierName: string) => {
    if (isOnTrial) return tierName === currentTrialTierName;
    if (isActivePaid) return tierName === activePlanName;
    return false;
  };

  const renderPlanCard = (tier: PricingTier, isCurrent: boolean) => {
    const Icon = tier.icon;
    const isUpgrading = upgradingTier === tier.name;

    return (
      <Card
        key={tier.id}
        className={`relative transition-all hover:shadow-xl ${
          isCurrent
            ? "border-cyan-500 border-2 shadow-lg ring-2 ring-cyan-500/20"
            : tier.popular && !isOnTrial
              ? "border-blue-500 border-2 shadow-lg scale-105"
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
        {!isCurrent && tier.popular && !isOnTrial && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-md">
              ⭐ Most Popular
            </span>
          </div>
        )}

        <CardHeader className="pb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-3 rounded-lg ${
              isCurrent
                ? "bg-gradient-to-br from-cyan-500 to-teal-500"
                : tier.popular && !isOnTrial
                  ? "bg-gradient-to-br from-blue-500 to-purple-500"
                  : "bg-muted"
            }`}>
              <Icon className={`w-6 h-6 ${
                isCurrent || (tier.popular && !isOnTrial) ? "text-white" : "text-primary"
              }`} />
            </div>
            <CardTitle className="text-2xl">{tier.display_name}</CardTitle>
          </div>
          <CardDescription className="text-base">{tier.description}</CardDescription>


          <div className="mt-6">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">{getMonthlyPrice(tier)}</span>
              <span className="text-muted-foreground text-lg">/month</span>
            </div>
            <div className="text-sm text-muted-foreground mt-2">Billed monthly</div>
          </div>
        </CardHeader>

        <CardContent>
          <Button
            onClick={() => handlePlanClick(tier)}
            disabled={isUpgrading || (isActivePaid && isCurrent)}
            className={`w-full mb-2 transition-all ${
              isCurrent
                ? "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
                : tier.popular && !isOnTrial && !isActivePaid
                  ? "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
                  : ""
            }`}
            variant={isCurrent || (tier.popular && !isOnTrial && !isActivePaid) ? "default" : "outline"}
            size="lg"
          >
            {isUpgrading ? (
              <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Redirecting…</>
            ) : isActivePaid ? (
              isCurrent ? 'Your Active Plan' : `Switch to ${tier.display_name}`
            ) : isOnTrial ? (
              isCurrent ? `Upgrade to ${tier.display_name} — ${getMonthlyPrice(tier)}/mo` : isDowngrade(tier.name) ? `Switch to ${tier.display_name}` : `Upgrade to ${tier.display_name}`
            ) : hasUsedTrial ? (
              `Subscribe to ${tier.display_name}`
            ) : (
              'Start 3-Day Free Trial'
            )}
            {!isUpgrading && !( isActivePaid && isCurrent) && <ArrowRight className="ml-2 w-4 h-4" />}
           </Button>
          {/* Fallback link if redirect was blocked */}
          {isUpgrading && checkoutFallbackUrl && (
            <a
              href={checkoutFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-primary underline mt-2"
            >
              Tap here if you're not redirected
            </a>
          )}
          <p className="text-xs text-center text-muted-foreground mb-4">
            {isActivePaid && isCurrent
              ? 'Manage your subscription in Settings'
              : isOnTrial
              ? 'Pay now • Instant activation • Cancel anytime'
              : hasUsedTrial
              ? `${getMonthlyPrice(tier)}/month • Cancel anytime`
              : `Then ${getMonthlyPrice(tier)}/month • Cancel anytime`
            }
          </p>

          <div className="space-y-4">
            <div className="text-sm font-semibold text-muted-foreground mb-2">What's Included:</div>
            <ul className="space-y-3">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  <span className="text-sm leading-relaxed">{feature}</span>
                </li>
              ))}
              {tier.scanLine && (
                <li className={`flex items-start gap-3 ${tier.scanDisabled ? 'opacity-50' : ''}`}>
                  <Sparkles className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    {tier.scanLine.replace(/ — Coming Soon$/, '').replace(/\(Coming Soon — Pro & above\)/, '(Coming Soon — Pro & above)')}
                    <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground leading-none whitespace-nowrap">
                      Coming Soon
                    </span>
                  </span>
                </li>
              )}
            </ul>
            {tier.notIncluded && tier.notIncluded.length > 0 && (
              <ul className="space-y-3 mt-4 pt-4 border-t border-border">
                {tier.notIncluded.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <X className="w-5 h-5 text-muted-foreground/50 shrink-0 mt-0.5" />
                    <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const orderedTiers = getOrderedTiers();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <SEOHead title="Pricing — Plans from $79/mo | Snap Ignite" description="Choose your Snap Ignite plan. Starter ($79/mo), Professional ($149/mo), or Enterprise ($299/mo). All plans include 3,800+ cities, code violation data, and enforcement scoring. Start with a free trial." canonical="https://snapignite.com/pricing" />
      {/* Signed-in user banner */}
      {user && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800">
          <div className="container max-w-7xl py-3 px-4 flex items-center justify-center gap-2 text-sm">
            <span className="text-blue-700 dark:text-blue-300">
              Signed in as <span className="font-medium">{user.email}</span>
            </span>
            <span className="text-blue-400 dark:text-blue-600">|</span>
            <button onClick={handleSignOut} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Not you? Sign out
            </button>
          </div>
        </div>
      )}

      {/* ===== ACTIVE PAID USER: Confirmation Hero ===== */}
      {isActivePaid && activePlanName && (
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-950 text-white">
          <div className="container max-w-4xl py-10 px-4 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              Active Subscription
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              You're on the {TRIAL_TIER_DISPLAY[activePlanName] || activePlanName} plan
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

      {/* ===== TRIAL USER: Personalized Upgrade Hero ===== */}
      {isOnTrial && !isActivePaid && currentTrialTierObj && (
        <div className="bg-gradient-to-br from-slate-900 via-cyan-950 to-teal-950 text-white">
          <div className="container max-w-4xl py-10 px-4 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-sm font-medium mb-6">
              <Clock className="w-4 h-4" />
              {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left on your {trialTierDisplayName} trial
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              Keep your {trialTierDisplayName} access — upgrade now
            </h1>
            <p className="text-lg text-cyan-100/80 mb-8 max-w-2xl mx-auto">
              Your trial expires soon. Lock in your {trialTierDisplayName} plan at {getMonthlyPrice(currentTrialTierObj)}/month and keep full access to everything you've been using.
            </p>

            {/* Primary CTA */}
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={() => handleDirectUpgrade(currentTrialTierName!)}
                disabled={upgradingTier === currentTrialTierName}
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white text-lg px-10 py-6 rounded-xl shadow-xl shadow-cyan-500/25"
              >
                {upgradingTier === currentTrialTierName ? (
                  <><Loader2 className="mr-2 w-5 h-5 animate-spin" /> Redirecting…</>
                ) : (
                  <>Upgrade to {trialTierDisplayName} — {getMonthlyPrice(currentTrialTierObj)}/mo <ArrowRight className="ml-2 w-5 h-5" /></>
                )}
              </Button>
              {/* Fallback link if redirect was blocked */}
              {upgradingTier === currentTrialTierName && checkoutFallbackUrl && (
                <a
                  href={checkoutFallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-200 underline"
                >
                  Tap here if you're not redirected
                </a>
              )}
              <p className="text-sm text-cyan-200/60">
                Instant activation • Cancel anytime • {trialExportsRemaining} exports remaining in trial
              </p>
            </div>

          </div>
        </div>
      )}

      {/* ===== EXPIRED TRIAL USER: Upgrade Hero ===== */}
      {hasTrialExpired && !isOnTrial && !isActivePaid && (
        <div className="bg-gradient-to-br from-slate-900 via-red-950 to-orange-950 text-white">
          <div className="container max-w-4xl py-10 px-4 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/20 border border-red-400/30 text-red-300 text-sm font-medium mb-6">
              <AlertTriangle className="w-4 h-4" />
              Trial Expired
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              Your free trial has ended
            </h1>
            <p className="text-lg text-red-100/80 mb-4 max-w-2xl mx-auto">
              Subscribe to a plan below to unlock property data, exports, and enforcement intelligence.
            </p>
          </div>
        </div>
      )}

      <div className="container max-w-7xl py-12 px-4">
        {/* Header — only for non-trial/non-active users */}
        {!isOnTrial && !isActivePaid && (
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Add Enforcement Intelligence to Your Stack
            </h1>
            <p className="text-xl text-muted-foreground mb-2">
              No hidden fees. No per-record charges. No surprises.
            </p>
            <p className="text-sm text-muted-foreground">
              Access to 3,800+ cities nationwide (growing monthly)
            </p>
          </div>
        )}

        {/* Section label for trial/active users */}
        {(isOnTrial || isActivePaid) && (
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground">All Plans</h2>
            <p className="text-muted-foreground mt-1">
              {isActivePaid ? 'Your active plan is highlighted' : 'Your current trial plan is shown first'}
            </p>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {orderedTiers.map((tier) => renderPlanCard(tier, isCurrentPlan(tier.name)))}
        </div>

        {/* Water Shutoff Value Prop */}
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
            {!isOnTrial && (
              <Card>
                <CardHeader><CardTitle className="text-lg">How does the free trial work?</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Start a 3-day trial — $0 due today. Enter your payment method at checkout and get 500 property
                    exports to test data quality. Search unlimited properties, save favorites, and access tier-specific
                    features. Your subscription begins automatically after 3 days, or cancel anytime before then.
                  </p>
                </CardContent>
              </Card>
            )}
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
              <CardHeader><CardTitle className="text-lg">What are CSV exports?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  CSV exports let you download property data for use in your own systems, mail campaigns, or CRM.
                  Each export counts toward your monthly limit based on your plan tier.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">What is address checking?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                   Upload your own list of addresses and we'll check which ones have active code violations, water shutoffs, 
                   and other enforcement signals. Starter gets 10,000 addresses checked/month, Pro gets 50,000/month, and
                   Elite gets unlimited.
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
            <Card>
              <CardHeader><CardTitle className="text-lg">How often is data updated?</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Data is refreshed monthly across 3,800+ cities nationwide, with continuous expansion underway.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground mb-4">
            Questions? Email us at <a href="mailto:hello@snapignite.com" className="text-blue-600 dark:text-blue-400 hover:underline">hello@snapignite.com</a>
          </p>
        </div>
      </div>

      {/* Trial Signup Modal — only rendered for non-trial users */}
      {!isOnTrial && (
        <TrialSignupModal
          open={trialModalOpen}
          onOpenChange={setTrialModalOpen}
          selectedTier={selectedTrialTier}
        />
      )}

      {/* Downgrade Confirmation Dialog */}
      <AlertDialog open={!!downgradeConfirm} onOpenChange={(open) => !open && setDowngradeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              You're about to downgrade
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You're currently trialing <strong>{trialTierDisplayName}</strong>. Switching to{' '}
                <strong>{downgradeConfirm?.display_name}</strong> means you'll lose access to:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {currentTrialTierName === 'enterprise' && downgradeConfirm?.name !== 'enterprise' && (
                  <>
                    <li>Water shutoff enforcement data</li>
                    <li>25,000 monthly exports (vs {downgradeConfirm?.name === 'starter' ? '5,000' : '15,000'})</li>
                    {downgradeConfirm?.name === 'starter' && <li>Pressure Level™ filters</li>}
                  </>
                )}
                {currentTrialTierName === 'professional' && downgradeConfirm?.name === 'starter' && (
                  <>
                    <li>Pressure Level™ filters</li>
                    <li>15,000 monthly exports (vs 5,000)</li>
                  </>
                )}
              </ul>
              <p className="text-sm font-medium">Are you sure you want to proceed with {downgradeConfirm?.display_name}?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep {trialTierDisplayName}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (downgradeConfirm) {
                  handleDirectUpgrade(downgradeConfirm.name);
                  setDowngradeConfirm(null);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Switch to {downgradeConfirm?.display_name}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
