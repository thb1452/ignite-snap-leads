import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Sparkles, TrendingUp, ExternalLink, Loader2, Crown, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

const PLAN_CONFIGS = {
  free_trial: {
    name: "Free Trial",
    icon: Zap,
    color: "text-blue-500",
    gradient: "from-blue-500/10 to-blue-500/5",
  },
  starter: {
    name: "Starter",
    icon: TrendingUp,
    color: "text-green-500",
    gradient: "from-green-500/10 to-green-500/5",
  },
  pro: {
    name: "Pro",
    icon: Sparkles,
    color: "text-purple-500",
    gradient: "from-purple-500/10 to-purple-500/5",
  },
  elite: {
    name: "Elite",
    icon: Crown,
    color: "text-amber-500",
    gradient: "from-amber-500/10 to-amber-500/5",
  },
};

export function SubscriptionSettings() {
  const { subscription, plan, usage, loading, refetch } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Handle successful checkout return
  const sessionId = searchParams.get('session_id');
  const canceled = searchParams.get('canceled');

  useState(() => {
    if (sessionId) {
      toast({
        title: "Subscription Activated!",
        description: "Your new plan is now active. Welcome aboard!",
      });
      refetch();
      navigate('/settings?tab=subscription', { replace: true });
    } else if (canceled) {
      toast({
        title: "Checkout Canceled",
        description: "No charges were made. You can upgrade anytime.",
        variant: "destructive",
      });
      navigate('/settings?tab=subscription', { replace: true });
    }
  });

  const handleUpgrade = async (planId: string) => {
    try {
      setCheckoutLoading(planId);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        throw new Error("Please sign in to upgrade");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ plan_id: planId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      window.location.href = url; // Redirect to Stripe Checkout
    } catch (error: any) {
      console.error("[SubscriptionSettings] Checkout error:", error);
      toast({
        title: "Checkout Failed",
        description: error.message || "Failed to start checkout process",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        throw new Error("Please sign in");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create portal session");
      }

      const { url } = await response.json();
      window.open(url, '_blank'); // Open portal in new tab
    } catch (error: any) {
      console.error("[SubscriptionSettings] Portal error:", error);
      toast({
        title: "Portal Failed",
        description: error.message || "Failed to open customer portal",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  const planConfig = plan ? PLAN_CONFIGS[plan.name as keyof typeof PLAN_CONFIGS] : null;
  const PlanIcon = planConfig?.icon || Zap;

  const csvExportsUsed = usage?.csv_exports_count || 0;
  const csvExportsLimit = plan?.max_csv_exports_per_month || 0;
  const csvExportsPercent = csvExportsLimit === -1 ? 0 : Math.min(100, (csvExportsUsed / Math.max(1, csvExportsLimit)) * 100);

  const skipTracesUsed = usage?.skip_traces_used || 0;
  const skipTracesLimit = plan?.skip_trace_credits_per_month || 0;
  const skipTracesPercent = Math.min(100, (skipTracesUsed / Math.max(1, skipTracesLimit)) * 100);

  const periodEnd = subscription?.period_end ? new Date(subscription.period_end) : null;
  const daysUntilRenewal = periodEnd ? Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      {plan && (
        <Card className={`border-2 bg-gradient-to-br ${planConfig?.gradient || 'from-slate-50 to-white'}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center`}>
                  <PlanIcon className={`h-6 w-6 ${planConfig?.color || 'text-brand'}`} />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {plan.display_name}
                    {subscription?.status === 'active' && (
                      <Badge className="bg-green-500 text-white">Active</Badge>
                    )}
                    {subscription?.status === 'trial' && (
                      <Badge className="bg-blue-500 text-white">Trial</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {plan.price_monthly_cents === 0
                      ? 'Free'
                      : `$${(plan.price_monthly_cents / 100).toFixed(0)}/month`}
                    {daysUntilRenewal && (
                      <span className="ml-2">• Renews in {daysUntilRenewal} days</span>
                    )}
                  </CardDescription>
                </div>
              </div>
              {subscription?.stripe_subscription_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="gap-2"
                >
                  {portalLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Manage
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Usage Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CSV Exports */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-600">CSV Exports</span>
                  <span className="font-medium text-ink-900">
                    {csvExportsUsed} / {csvExportsLimit === -1 ? '∞' : csvExportsLimit}
                  </span>
                </div>
                {csvExportsLimit !== -1 && (
                  <Progress value={csvExportsPercent} className="h-2" />
                )}
              </div>

              {/* Skip Traces */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-600">Skip Trace Credits</span>
                  <span className="font-medium text-ink-900">
                    {skipTracesUsed} / {skipTracesLimit}
                  </span>
                </div>
                <Progress value={skipTracesPercent} className="h-2" />
              </div>
            </div>

            {/* Features */}
            <div className="pt-4 border-t">
              <h4 className="font-semibold text-sm text-ink-900 mb-3">Plan Features:</h4>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {plan.features && (plan.features as string[]).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-ink-700">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Options */}
      {plan && plan.name !== 'elite' && (
        <div>
          <h3 className="text-lg font-semibold text-ink-900 mb-4">Upgrade Your Plan</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plan.name === 'free_trial' || plan.name === 'starter' ? (
              <UpgradePlanCard
                name="Pro"
                price="$89/mo"
                features={[
                  "Up to 10 jurisdictions",
                  "25,000 records per month",
                  "50 CSV exports/month",
                  "250 skip trace credits/month",
                  "Bulk SMS campaigns",
                ]}
                badge="Popular"
                onUpgrade={() => handleUpgrade('pro-plan-id')}
                loading={checkoutLoading === 'pro-plan-id'}
              />
            ) : null}

            {plan.name !== 'elite' && (
              <UpgradePlanCard
                name="Elite"
                price="$199/mo"
                features={[
                  "Unlimited jurisdictions",
                  "100,000 records per month",
                  "Unlimited CSV exports",
                  "1,000 skip trace credits/month",
                  "Bulk SMS & Mail campaigns",
                  "API access",
                ]}
                badge="Best Value"
                onUpgrade={() => handleUpgrade('elite-plan-id')}
                loading={checkoutLoading === 'elite-plan-id'}
              />
            )}
          </div>
        </div>
      )}

      {plan && plan.name === 'elite' && (
        <Card>
          <CardContent className="py-8 text-center">
            <Crown className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-ink-900 mb-2">
              You're on the Elite Plan!
            </h3>
            <p className="text-ink-600 text-sm">
              You have access to all features and maximum limits. Need custom solutions?{" "}
              <a href="mailto:support@snapignite.com" className="text-brand underline">
                Contact us
              </a>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface UpgradePlanCardProps {
  name: string;
  price: string;
  features: string[];
  badge?: string;
  onUpgrade: () => void;
  loading: boolean;
}

function UpgradePlanCard({ name, price, features, badge, onUpgrade, loading }: UpgradePlanCardProps) {
  return (
    <Card className="relative border-2 border-brand/20 hover:border-brand/40 transition-all">
      {badge && (
        <Badge className="absolute -top-2 right-4 bg-brand text-white">{badge}</Badge>
      )}
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <div className="text-2xl font-bold text-brand">{price}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-ink-700">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <Button
          onClick={onUpgrade}
          disabled={loading}
          className="w-full gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Upgrade to {name}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
