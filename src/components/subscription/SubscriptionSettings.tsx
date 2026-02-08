import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Sparkles, TrendingUp, ExternalLink, Loader2, Crown, Zap, Mail } from "lucide-react";
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
  professional: {
    name: "Professional",
    icon: Sparkles,
    color: "text-purple-500",
    gradient: "from-purple-500/10 to-purple-500/5",
  },
  enterprise: {
    name: "Enterprise",
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
  const [portalUnavailable, setPortalUnavailable] = useState(false);

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

  const handleUpgrade = async (tierName: string) => {
    try {
      setCheckoutLoading(tierName);

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
          body: JSON.stringify({ tier_name: tierName, billing_cycle: 'monthly' }),
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
        if (response.status === 404) {
          setPortalUnavailable(true);
          return;
        }
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

  const csvExportsUsed = usage?.exports_count || 0;
  const csvExportsLimit = plan?.max_monthly_exports || 0;
  const csvExportsPercent = csvExportsLimit === -1 ? 0 : Math.min(100, (csvExportsUsed / Math.max(1, csvExportsLimit)) * 100);

  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const daysUntilRenewal = periodEnd ? Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  // No subscription state - show call to action
  if (!subscription || !plan) {
    return (
      <div className="space-y-6">
        <Card className="border-2 border-dashed border-muted-foreground/30">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <Zap className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              No Active Subscription
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Choose a plan to unlock enforcement intelligence and start finding motivated sellers.
            </p>
            <div className="flex gap-3 justify-center">
              <Button 
                onClick={() => handleUpgrade('starter')}
                variant="outline"
                disabled={checkoutLoading === 'starter'}
              >
                {checkoutLoading === 'starter' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Starter - $119/mo
              </Button>
              <Button 
                onClick={() => handleUpgrade('professional')}
                disabled={checkoutLoading === 'professional'}
                className="bg-brand hover:bg-brand/90"
              >
                {checkoutLoading === 'professional' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Professional - $249/mo
              </Button>
              <Button 
                onClick={() => handleUpgrade('enterprise')}
                variant="outline"
                disabled={checkoutLoading === 'enterprise'}
              >
                {checkoutLoading === 'enterprise' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Enterprise - $499/mo
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      {plan && (
        <Card className={`border-2 bg-gradient-to-br ${planConfig?.gradient || 'from-slate-50 to-white'}`}>
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0`}>
                  <PlanIcon className={`h-6 w-6 ${planConfig?.color || 'text-brand'}`} />
                </div>
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    {plan.display_name}
                    {subscription?.status === 'active' && (
                      <Badge className="bg-green-500 text-white">Active</Badge>
                    )}
                    {subscription?.status === 'trial' && (
                      <Badge className="bg-blue-500 text-white">Trial</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {plan.price_monthly_cents > 0 && (
                      <span>${(plan.price_monthly_cents / 100).toFixed(0)}/month</span>
                    )}
                    {daysUntilRenewal && (
                      <span className={plan.price_monthly_cents > 0 ? 'ml-2' : ''}>
                        {plan.price_monthly_cents > 0 ? '• ' : ''}Renews in {daysUntilRenewal} days
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
              {subscription?.stripe_subscription_id && (
                portalUnavailable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 self-start sm:self-center flex-shrink-0"
                    asChild
                  >
                    <a href="mailto:support@snapignite.com?subject=Billing%20Support">
                      <Mail className="h-4 w-4" />
                      Contact Support
                    </a>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                    className="gap-2 self-start sm:self-center flex-shrink-0"
                  >
                    {portalLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Manage
                  </Button>
                )
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
      {plan && plan.name !== 'enterprise' && (
        <div>
          <h3 className="text-lg font-semibold text-ink-900 mb-4">Upgrade Your Plan</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plan.name === 'starter' && (
              <UpgradePlanCard
                name="Professional"
                price="$249/mo"
                features={[
                  "25 county coverage",
                  "10,000 monthly exports",
                  "Advanced SnapScore filters",
                  "Violation type filtering",
                  "Rolling 30-day intelligence",
                ]}
                badge="Popular"
                onUpgrade={() => handleUpgrade('professional')}
                loading={checkoutLoading === 'professional'}
              />
            )}

            {(plan.name === 'starter' || plan.name === 'professional') && (
              <UpgradePlanCard
                name="Enterprise"
                price="$499/mo"
                features={[
                  "All 900+ counties",
                  "25,000 monthly exports",
                  "Full SnapScore AI suite",
                  "Escalation pattern alerts",
                  "API access (coming soon)",
                ]}
                badge="Best Value"
                onUpgrade={() => handleUpgrade('enterprise')}
                loading={checkoutLoading === 'enterprise'}
              />
            )}
          </div>
        </div>
      )}

      {plan && plan.name === 'enterprise' && (
        <Card>
          <CardContent className="py-8 text-center">
            <Crown className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-ink-900 mb-2">
              You're on the Enterprise Plan!
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
