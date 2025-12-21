import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Zap, TrendingUp, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface PricingTier {
  id: string;
  name: string;
  display_name: string;
  price_monthly_cents: number;
  price_annual_cents_with_discount: number;
  description: string;
  features: string[];
  max_jurisdictions: number;
  max_monthly_records: number;
  skip_trace_credits_per_month: number;
  icon: any;
  popular?: boolean;
}

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [fetchingTiers, setFetchingTiers] = useState(true);

  useEffect(() => {
    fetchPricingTiers();
  }, []);

  const fetchPricingTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('active_pricing_tiers')
        .select('*')
        .order('sort_order');

      if (error) throw error;

      const icons = [Zap, TrendingUp, Building2];

      const tiersWithIcons: PricingTier[] = (data || []).map((tier, index) => ({
        ...tier,
        icon: icons[index] || Zap,
        popular: tier.name === 'pro', // Mark Pro as popular
      }));

      setTiers(tiersWithIcons);
    } catch (error) {
      console.error('Error fetching pricing tiers:', error);
      toast.error('Failed to load pricing information');
    } finally {
      setFetchingTiers(false);
    }
  };

  const handleSelectPlan = async (tier: PricingTier) => {
    if (!user) {
      navigate("/leads");
      toast.error("Please sign in to select a plan");
      return;
    }

    setLoading(tier.name);

    try {
      // Create Stripe checkout session via edge function
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          tier_name: tier.name,
          billing_cycle: billingCycle,
        }
      });

      if (error) throw error;

      // Redirect to Stripe checkout
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error);
      toast.error(error.message || 'Failed to start checkout. Please try again.');
      setLoading(null);
    }
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

  if (fetchingTiers) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
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
            Access to 400+ counties (growing weekly)
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
          {tiers.map((tier) => {
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
                      Most Popular
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
                        💰 Save {getSavings(tier)}% with annual billing
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
                    disabled={loading === tier.name}
                    className={`w-full mb-6 transition-all ${
                      tier.popular
                        ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        : ""
                    }`}
                    variant={tier.popular ? "default" : "outline"}
                    size="lg"
                  >
                    {loading === tier.name ? (
                      "Loading..."
                    ) : (
                      <>
                        Get Started
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </>
                    )}
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
                    $1,548
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Annual cost (Starter tier)
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                    6-9x ROI
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Return on one deal
                  </div>
                </div>
              </div>
              <p className="text-center mt-6 text-muted-foreground">
                If Snap helps you close <span className="font-semibold text-foreground">just ONE deal</span> this year, you've made your money back 6-9 times over.
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
                <CardTitle className="text-lg">What's included in skip trace credits?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Skip trace credits give you owner phone numbers and emails for each property. Each property you trace uses 1 credit.
                  Additional credits available at $0.10/record (vs PropStream's $0.12/record).
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
                <CardTitle className="text-lg">What if my county isn't covered yet?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Request it! We prioritize new county coverage based on user requests.
                  We're adding 50-100 counties monthly. All paid subscribers can submit priority county requests.
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
