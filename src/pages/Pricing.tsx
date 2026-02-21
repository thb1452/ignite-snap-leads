import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Zap, TrendingUp, Building2, ArrowRight, Droplets, Clock, Lock, Loader2 } from "lucide-react";
import { TrialSignupModal } from "@/components/trial/TrialSignupModal";
import { useEliteCapacity } from "@/hooks/useEliteCapacity";
import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";

// Key to signal Auth page that user was already logged in when they clicked a plan
const SESSION_KEY_PRE_AUTH_USER = 'snap_pre_auth_user_existed';
interface PricingTier {
  id: string;
  name: string;
  display_name: string;
  price_monthly_cents: number;
  price_annual_cents_with_discount: number;
  description: string;
  features: string[];
  notIncluded?: string[];
  icon: any;
  popular?: boolean;
  highlight?: string;
}

// Updated pricing tiers - PropStream complementary positioning
const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'starter',
    display_name: 'Starter',
    price_monthly_cents: 7900,
    price_annual_cents_with_discount: 76000,
    description: 'For PropStream users who want premium targeting',
    features: [
      '1,500 monthly exports',
      'All properties, all counties',
      'Code violation data',
      'Weekly data refresh',
      'Email support',
    ],
    notIncluded: [
      'No water shutoff data',
    ],
    icon: Zap,
    popular: true,
  },
  {
    id: 'professional',
    name: 'professional',
    display_name: 'Pro',
    price_monthly_cents: 14900,
    price_annual_cents_with_discount: 143000,
    description: 'For serious operators stacking enforcement data',
    features: [
      '5,000 monthly exports',
      'All properties, all counties',
      'Code violation data',
      'Everything in Starter',
      'Pressure Level™ filters',
      'Priority email support',
    ],
    notIncluded: [
      'No water shutoff data',
    ],
    icon: TrendingUp,
    popular: false,
  },
  {
    id: 'enterprise',
    name: 'enterprise',
    display_name: 'Elite',
    price_monthly_cents: 29900,
    price_annual_cents_with_discount: 287000,
    description: 'For teams running enforcement-first strategies. Limited to 500 members.',
    features: [
      '15,000 monthly exports',
      'All properties, all counties',
      'Code violation + water shutoff data',
      'Everything in Pro',
      'API access (coming soon)',
    ],
    icon: Building2,
    popular: false,
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isOnTrial, trialDaysRemaining, trialExportsRemaining, trialTier } = useTrialStatus();
  const { spotsRemaining: eliteSpotsRemaining, isFull: isEliteFull } = useEliteCapacity();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [selectedTrialTier, setSelectedTrialTier] = useState('starter');
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const { toast } = useToast();

  const openTrialModal = (tier: string) => {
    setSelectedTrialTier(tier);
    setTrialModalOpen(true);
  };

  const handleDirectUpgrade = async (tierName: string) => {
    setUpgradingTier(tierName);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { tier_name: tierName, billing_cycle: billingCycle },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.assign(data.url);
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('[Pricing] Upgrade error:', err);
      toast({ title: 'Checkout failed', description: err.message || 'Please try again.', variant: 'destructive' });
      setUpgradingTier(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSelectPlan = (tier: PricingTier) => {
    // If user is already logged in, set a flag so Auth page knows to show account choice
    if (user) {
      try {
        sessionStorage.setItem(SESSION_KEY_PRE_AUTH_USER, 'true');
        console.log('[Pricing] User already logged in, setting pre-auth flag');
      } catch (e) {
        console.warn('[Pricing] Failed to set pre-auth flag:', e);
      }
    }
    
    // Redirect to auth page with plan
    console.log('[Pricing] Redirecting to auth with plan:', tier.name);
    navigate(`/auth?mode=signup&plan=${tier.name}`);
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toLocaleString()}`;
  };

  const getMonthlyPrice = (tier: PricingTier) => {
    if (billingCycle === "annual") {
      return formatPrice(Math.round(tier.price_annual_cents_with_discount / 12));
    }
    return formatPrice(tier.price_monthly_cents);
  };

  const getSavings = (tier: PricingTier) => {
    const annualMonthly = tier.price_annual_cents_with_discount / 12;
    const savings = Math.round(((tier.price_monthly_cents - annualMonthly) / tier.price_monthly_cents) * 100);
    return savings;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Signed-in user banner */}
      {user && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800">
          <div className="container max-w-7xl py-3 px-4 flex items-center justify-center gap-2 text-sm">
            <span className="text-blue-700 dark:text-blue-300">
              Signed in as <span className="font-medium">{user.email}</span>
            </span>
            <span className="text-blue-400 dark:text-blue-600">|</span>
            <button
              onClick={handleSignOut}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Not you? Sign out
            </button>
          </div>
        </div>
      )}

      {/* Trial status banner */}
      {isOnTrial && (
        <div className="bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border-b border-cyan-200 dark:border-cyan-800">
          <div className="container max-w-7xl py-3 px-4 flex items-center justify-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-cyan-600" />
            <span className="text-cyan-700 dark:text-cyan-300">
              You're on a <span className="font-semibold">{trialTier === 'professional' ? 'Pro' : trialTier === 'enterprise' ? 'Elite' : 'Starter'} trial</span> with {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} and {trialExportsRemaining} exports remaining.
            </span>
          </div>
        </div>
      )}

      <div className="container max-w-7xl py-12 px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Add Enforcement Intelligence to Your Stack
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            No hidden fees. No per-record charges. No surprises.
          </p>
          <p className="text-sm text-muted-foreground">
            Access to 400+ counties across all 50 states (growing weekly)
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-3 p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm mt-8">
            <Button
              variant={billingCycle === "monthly" ? "default" : "ghost"}
              onClick={() => setBillingCycle("monthly")}
              size="sm"
              className="transition-all"
            >
              Monthly
            </Button>
            <Button
              variant={billingCycle === "annual" ? "default" : "ghost"}
              onClick={() => setBillingCycle("annual")}
              size="sm"
              className="transition-all"
            >
              Annual
              <span className="ml-2 text-xs bg-green-500/20 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                Save 20%
              </span>
            </Button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {PRICING_TIERS.map((tier) => {
            const Icon = tier.icon;
            return (
              <Card
                key={tier.id}
                className={`relative transition-all hover:shadow-xl ${
                  tier.popular
                    ? "border-blue-500 border-2 shadow-lg scale-105"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-md">
                      ⭐ Most Popular
                    </span>
                  </div>
                )}

                <CardHeader className="pb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-3 rounded-lg ${
                      tier.popular
                        ? "bg-gradient-to-br from-blue-500 to-purple-500"
                        : "bg-slate-100 dark:bg-slate-800"
                    }`}>
                      <Icon className={`w-6 h-6 ${
                        tier.popular ? "text-white" : "text-blue-600 dark:text-blue-400"
                      }`} />
                    </div>
                    <div>
                      <CardTitle className="text-2xl">{tier.display_name}</CardTitle>
                    </div>
                  </div>
                  <CardDescription className="text-base">{tier.description}</CardDescription>

                  {tier.name === 'enterprise' && (
                    <div className="mt-3">
                      {isEliteFull ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs">
                          <Lock className="w-3.5 h-3.5" />
                          <span className="font-medium">Waitlist Only — 500 member cap reached</span>
                        </div>
                      ) : eliteSpotsRemaining <= 50 ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-xs">
                          <Lock className="w-3.5 h-3.5" />
                          <span className="font-medium">Only {eliteSpotsRemaining} of 500 spots left</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs">
                          <Lock className="w-3.5 h-3.5" />
                          <span className="font-medium">{eliteSpotsRemaining} of 500 Elite spots remaining</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-6">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-bold">
                        {getMonthlyPrice(tier)}
                      </span>
                      <span className="text-muted-foreground text-lg">/month</span>
                    </div>
                    {billingCycle === "annual" && (
                      <div className="text-sm text-green-600 dark:text-green-400 mt-2 font-medium">
                        Save {getSavings(tier)}% with annual billing
                      </div>
                    )}
                    {billingCycle === "monthly" && (
                      <div className="text-sm text-muted-foreground mt-2">
                        Billed monthly
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent>
                  <Button
                    onClick={() => {
                      if (tier.name === 'enterprise' && isEliteFull) {
                        window.location.href = 'mailto:support@snapignite.com?subject=Elite%20Waitlist&body=I%20would%20like%20to%20join%20the%20Elite%20tier%20waitlist.';
                        return;
                      }
                      if (isOnTrial) {
                        handleDirectUpgrade(tier.name);
                      } else {
                        openTrialModal(tier.name);
                      }
                    }}
                    disabled={upgradingTier === tier.name}
                    className={`w-full mb-2 transition-all ${
                      tier.popular
                        ? "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
                        : ""
                    }`}
                    variant={tier.popular ? "default" : "outline"}
                    size="lg"
                  >
                    {upgradingTier === tier.name ? (
                      <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Redirecting…</>
                    ) : tier.name === 'enterprise' && isEliteFull ? (
                      'Join Waitlist'
                    ) : isOnTrial ? (
                      'Upgrade Now'
                    ) : (
                      'Start 7-Day Free Trial'
                    )}
                    {upgradingTier !== tier.name && <ArrowRight className="ml-2 w-4 h-4" />}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mb-4">
                    {isOnTrial ? 'Pay now, upgrade instantly' : `Then ${getMonthlyPrice(tier)}/month • Cancel anytime`}
                  </p>

                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-muted-foreground mb-2">
                      What's Included:
                    </div>
                    <ul className="space-y-3">
                      {tier.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                          <span className="text-sm leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    {/* Not included items */}
                    {tier.notIncluded && tier.notIncluded.length > 0 && (
                      <ul className="space-y-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        {tier.notIncluded.map((item, index) => (
                          <li key={index} className="flex items-start gap-3">
                            <X className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    
                    {/* Highlight text for Pro tier */}
                    {tier.highlight && (
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2">
                          <Droplets className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            {tier.highlight}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
          <h2 className="text-3xl font-bold mb-8 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How does the free trial work?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Start a 7-day trial — $0 due today. Enter your payment method at checkout and get 50 property
                  exports to test data quality. Search unlimited properties, save favorites, and access tier-specific
                  features. Your subscription begins automatically after 7 days, or cancel anytime before then.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What's the difference between code violations and water shutoffs?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  <strong>Code violations</strong> indicate properties where the city is applying enforcement pressure.
                  <strong> Water shutoffs</strong> are utility disconnections — a stronger enforcement signal.
                  Water shutoff data is available on the Elite plan.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What are CSV exports?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  CSV exports let you download property data for use in your own systems, mail campaigns, or CRM.
                  Each export counts toward your monthly limit based on your plan tier.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I change tiers later?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Yes! Upgrade or downgrade anytime. Upgrades take effect immediately with prorated billing.
                  Downgrades take effect at your next billing cycle.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How often is data updated?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Strategic 60-90 day rotation across 400+ counties (expanding to 2,000+).
                  Each county refreshed 4-6 times annually.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground mb-4">
            Questions? Email us at <a href="mailto:support@snapignite.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@snapignite.com</a>
          </p>
        </div>
      </div>

      {/* Trial Signup Modal */}
      <TrialSignupModal
        open={trialModalOpen}
        onOpenChange={setTrialModalOpen}
        selectedTier={selectedTrialTier}
      />
    </div>
  );
}
