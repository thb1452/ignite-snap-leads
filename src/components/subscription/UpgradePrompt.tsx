import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: 'csv_export' | 'skip_trace' | 'bulk_sms' | 'bulk_mail' | 'api_access';
  currentPlan?: string;
}

const LIMIT_MESSAGES = {
  csv_export: {
    title: "CSV Export Limit Reached",
    description: "You've used all your CSV exports for this billing period.",
    icon: TrendingUp,
    color: "text-blue-500",
  },
  skip_trace: {
    title: "Skip Trace Limit Reached",
    description: "You've used all your skip trace credits for this billing period.",
    icon: Zap,
    color: "text-amber-500",
  },
  bulk_sms: {
    title: "Bulk SMS Not Available",
    description: "Bulk SMS campaigns are available on Pro and Elite plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  bulk_mail: {
    title: "Bulk Mail Not Available",
    description: "Bulk mail campaigns are available on Elite plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  api_access: {
    title: "API Access Not Available",
    description: "API access is available on Elite plans only.",
    icon: Sparkles,
    color: "text-purple-500",
  },
};

const PLAN_FEATURES = {
  starter: {
    name: "Starter",
    price: "$39/mo",
    features: [
      "Up to 3 jurisdictions",
      "5,000 records per month",
      "10 CSV exports/month",
      "50 skip trace credits/month",
    ],
  },
  pro: {
    name: "Pro",
    price: "$89/mo",
    features: [
      "Up to 10 jurisdictions",
      "25,000 records per month",
      "50 CSV exports/month",
      "250 skip trace credits/month",
      "Bulk SMS campaigns",
    ],
    badge: "Popular",
  },
  elite: {
    name: "Elite",
    price: "$199/mo",
    features: [
      "Unlimited jurisdictions",
      "100,000 records per month",
      "Unlimited CSV exports",
      "1,000 skip trace credits/month",
      "Bulk SMS & Mail campaigns",
      "API access",
    ],
    badge: "Best Value",
  },
};

export function UpgradePrompt({ open, onOpenChange, limitType, currentPlan = 'starter' }: UpgradePromptProps) {
  const navigate = useNavigate();
  const config = LIMIT_MESSAGES[limitType];
  const Icon = config.icon;

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate('/settings?tab=subscription');
  };

  const handleViewPlans = () => {
    onOpenChange(false);
    window.open('/how-snap-works', '_blank');
  };

  // Determine which plans to show based on current plan
  const availablePlans = currentPlan === 'starter'
    ? ['pro', 'elite']
    : currentPlan === 'pro'
    ? ['elite']
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-brand/20 to-brand/5 flex items-center justify-center`}>
              <Icon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div>
              <DialogTitle className="text-xl">{config.title}</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                {config.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {availablePlans.length > 0 && (
            <>
              <div>
                <h3 className="font-semibold text-ink-900 mb-4">Upgrade to unlock more:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availablePlans.map((planKey) => {
                    const plan = PLAN_FEATURES[planKey as keyof typeof PLAN_FEATURES];
                    return (
                      <div
                        key={planKey}
                        className="relative p-4 border-2 border-brand/20 rounded-lg bg-gradient-to-br from-brand/5 to-transparent hover:border-brand/40 transition-all"
                      >
                        {plan.badge && (
                          <Badge className="absolute -top-2 right-4 bg-brand text-white">
                            {plan.badge}
                          </Badge>
                        )}
                        <div className="mb-3">
                          <h4 className="font-bold text-lg text-ink-900">{plan.name}</h4>
                          <p className="text-2xl font-bold text-brand mt-1">{plan.price}</p>
                        </div>
                        <ul className="space-y-2">
                          {plan.features.map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-ink-700">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Maybe Later
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleViewPlans}>
                    View All Plans
                  </Button>
                  <Button onClick={handleUpgrade} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </>
          )}

          {availablePlans.length === 0 && (
            <div className="text-center py-8">
              <p className="text-ink-700 mb-4">
                You're already on the Elite plan with maximum limits!
              </p>
              <p className="text-sm text-ink-500">
                Need custom limits? Contact support for enterprise options.
              </p>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="mt-4">
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
