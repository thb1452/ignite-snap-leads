import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Zap, TrendingUp, Building2, ArrowRight, Droplets } from "lucide-react";

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

// Updated pricing tiers - no state limits, data quality based
const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'starter',
    display_name: 'Starter',
    price_monthly_cents: 11900,
    price_annual_cents_with_discount: 114000,
    description: 'For focused local operators',
    features: [
      '2,500 monthly exports',
      'Basic code violations',
      'Browse all 50 states',
      'Basic SnapScore filtering',
      'Weekly data refresh',
      '1 user seat',
      'Email support',
    ],
    notIncluded: [
      'No water shutoff data',
      'No utility disconnection tracking',
    ],
    icon: Zap,
    popular: false,
  },
  {
    id: 'professional',
    name: 'professional',
    display_name: 'Professional',
    price_monthly_cents: 24900,
    price_annual_cents_with_discount: 239000,
    description: 'For growing acquisition operations',
    features: [
      'Everything in Starter PLUS:',
      '10,000 monthly exports',
      '💧 Water shutoff alerts (PREMIUM DATA)',
      'Advanced SnapScore AI filtering',
      'Violation type filtering',
      'Rolling 30-day intelligence',
      '3 user seats',
      'Priority email support',
    ],
    icon: TrendingUp,
    popular: true,
    highlight: 'Water shutoffs convert at 10x the rate of basic violations',
  },
  {
    id: 'enterprise',
    name: 'enterprise',
    display_name: 'Enterprise',
    price_monthly_cents: 49900,
    price_annual_cents_with_discount: 479000,
    description: 'For serious multi-market teams',
    features: [
      'Everything in Professional PLUS:',
      '25,000 monthly exports',
      'All 50 states (900+ counties)',
      'Full SnapScore AI suite',
      'API access (coming soon)',
      '10 user seats',
      'Dedicated account manager',
    ],
    icon: Building2,
    popular: false,
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

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

      <div className="container max-w-7xl py-12 px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Enforcement Pressure Intelligence
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            Track where cities are applying maximum pressure on property owners
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
                    onClick={() => handleSelectPlan(tier)}
                    className={`w-full mb-6 transition-all ${
                      tier.popular
                        ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        : ""
                    }`}
                    variant={tier.popular ? "default" : "outline"}
                    size="lg"
                  >
                    Get Started
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>

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
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-2">
                    10x
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Higher conversion rate vs basic violations
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                    30 days
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Average time to sale after shutoff
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                    Maximum
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Seller motivation level
                  </div>
                </div>
              </div>
              <p className="text-center mt-6 text-muted-foreground">
                Properties with utility disconnections represent the <span className="font-semibold text-foreground">highest-motivation sellers</span> in the market.
                Professional and Enterprise plans include this premium data.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ROI Section */}
        <div className="max-w-3xl mx-auto mb-16">
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-2xl text-center">One Deal Pays for the Year</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                    $10,000+
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Typical wholesale assignment fee
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                    $1,428
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Annual cost (Starter tier)
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                    7x ROI
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Return on one deal
                  </div>
                </div>
              </div>
              <p className="text-center mt-6 text-muted-foreground">
                If Snap helps you close <span className="font-semibold text-foreground">just ONE deal</span> this year, you've made your money back 7 times over.
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
                <CardTitle className="text-lg">What's the difference between code violations and water shutoffs?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  <strong>Code violations</strong> indicate properties where the city is applying enforcement pressure (tall grass, structural issues, permits, etc.).
                  <strong> Water shutoffs</strong> are utility disconnections - these indicate <em>maximum</em> distress and typically result in 10x higher conversion rates.
                  Professional and Enterprise plans include both data types.
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
                  Each county refreshed 4-6 times annually - significantly better than quarterly batch providers like PropStream.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What makes Snap different from PropStream?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  PropStream is general property data. Snap is <span className="font-semibold">specialized enforcement pressure intelligence</span>.
                  We focus exclusively on properties where cities are applying maximum code enforcement pressure - the motivated sellers
                  wholesalers and investors actually want to find. PropStream gives you everything; Snap gives you what matters.
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
    </div>
  );
}
