import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Loader2, Crown, Zap, Sparkles, TrendingUp, List, Building2, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const PLAN_CONFIGS = {
  free_trial: { icon: Zap, color: "text-blue-500" },
  starter: { icon: TrendingUp, color: "text-green-500" },
  professional: { icon: Sparkles, color: "text-purple-500" }, // Pro
  enterprise: { icon: Crown, color: "text-amber-500" }, // Elite
};

interface PlanUsageSectionProps {
  listsCount?: number;
  propertiesCount?: number;
}

export function PlanUsageSection({ listsCount = 0, propertiesCount = 0 }: PlanUsageSectionProps) {
  const { subscription, plan, usage, loading, refetch } = useSubscription();
  const { isOnTrial, trialExportsUsed, trialExportsLimit } = useTrialStatus();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalUnavailable, setPortalUnavailable] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) throw new Error("Please sign in");

      const supabaseUrl = import.meta.env.VITE_EXTERNAL_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-portal-session`,
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
      window.open(url, '_blank');
    } catch (error: any) {
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
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) throw new Error("Please sign in to upgrade");

      const supabaseUrl = import.meta.env.VITE_EXTERNAL_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-checkout-session`,
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
      window.location.href = url;
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

  const planConfig = plan ? PLAN_CONFIGS[plan.name as keyof typeof PLAN_CONFIGS] : null;
  const PlanIcon = planConfig?.icon || Zap;

  // For trial users, show trial export counts instead of plan limits
  const csvExportsUsed = isOnTrial ? trialExportsUsed : (usage?.exports_count || 0);
  const csvExportsLimit = isOnTrial ? trialExportsLimit : (plan?.max_monthly_exports || 0);
  const csvExportsPercent = csvExportsLimit === -1 ? 0 : Math.min(100, (csvExportsUsed / Math.max(1, csvExportsLimit)) * 100);

  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const formattedRenewal = periodEnd ? periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // No subscription
  if (!subscription || !plan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Your Plan & Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
            <Zap className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Active Subscription</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Choose a plan to unlock enforcement intelligence.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button
              onClick={() => handleUpgrade('starter')}
              variant="outline"
              disabled={!!checkoutLoading}
            >
              {checkoutLoading === 'starter' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Starter - $79/mo
            </Button>
            <Button
              onClick={() => handleUpgrade('professional')}
              disabled={!!checkoutLoading}
            >
              {checkoutLoading === 'professional' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Pro - $149/mo
            </Button>
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
        {/* Plan Info Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-background shadow-sm flex items-center justify-center flex-shrink-0">
              <PlanIcon className={`h-6 w-6 ${planConfig?.color || 'text-brand'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-lg">{plan.display_name}</span>
                {plan.price_monthly_cents > 0 && (
                  <span className="text-muted-foreground">· ${(plan.price_monthly_cents / 100).toFixed(0)}/month</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {subscription?.status === 'active' && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                )}
                {formattedRenewal && <span>Renews {formattedRenewal}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {subscription?.stripe_subscription_id && (
              portalUnavailable ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  asChild
                >
                  <a href="mailto:support@snapignite.com?subject=Billing%20Support">
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
            {plan.name !== 'enterprise' && (
              <Button
                size="sm"
                onClick={() => handleUpgrade(plan.name === 'starter' ? 'professional' : 'enterprise')}
                disabled={!!checkoutLoading}
              >
                {checkoutLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Upgrade
              </Button>
            )}
          </div>
        </div>

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
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <List className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Lists Created</p>
                  <p className="text-lg font-semibold">{listsCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Properties Tracked</p>
                  <p className="text-lg font-semibold">{propertiesCount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
