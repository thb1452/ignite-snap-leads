import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles, TrendingUp, Download, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { LimitType, PlanTierName } from "@/types/subscription";

export interface ExportContext {
  requestedCount: number;
  remainingCount: number;
  usedCount: number;
  maxCount: number;
  onPartialExport: (count: number) => void;
}

interface UpgradePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: LimitType;
  currentPlan?: PlanTierName;
  exportContext?: ExportContext;
}

// Messages for usage limits (counters)
const LIMIT_MESSAGES: Record<LimitType, { title: string; description: string; icon: typeof TrendingUp; color: string }> = {
  exports: {
    title: "Property Export Limit Reached",
    description: "You've exported all the properties available in your plan this month. Each property exported counts against your monthly limit.",
    icon: TrendingUp,
    color: "text-blue-500",
  },
  api_calls: {
    title: "API Call Limit Reached",
    description: "You've used all your API calls for this billing period.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  // Feature-based limits (booleans)
  advanced_filters: {
    title: "Advanced Filters Not Available",
    description: "Advanced filtering is available on Professional and Enterprise plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  violation_filtering: {
    title: "Violation Filtering Not Available",
    description: "Violation type filtering is available on Professional and Enterprise plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  rolling_intelligence: {
    title: "Rolling Intelligence Not Available",
    description: "30-day rolling intelligence is available on Professional and Enterprise plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  escalation_alerts: {
    title: "Escalation Alerts Not Available",
    description: "Escalation pattern alerts are available on Enterprise plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  api_access: {
    title: "API Access Not Available",
    description: "API access is available on Enterprise plans only.",
    icon: Sparkles,
    color: "text-purple-500",
  },
};

const PLAN_FEATURES = {
  starter: {
    name: "Starter",
    price: "$119/mo",
    badge: "",
    features: [
      "5 county coverage",
      "2,500 property exports/month",
      "Basic SnapScore filtering",
      "Weekly data refresh",
    ],
  },
  professional: {
    name: "Professional",
    price: "$249/mo",
    features: [
      "25 county coverage",
      "10,000 property exports/month",
      "Advanced SnapScore filters",
      "Violation type filtering",
      "Rolling 30-day intelligence",
    ],
    badge: "Popular",
  },
  enterprise: {
    name: "Enterprise",
    price: "$499/mo",
    features: [
      "All 900+ counties",
      "25,000 property exports/month",
      "Full SnapScore AI suite",
      "Escalation pattern alerts",
      "API access (coming soon)",
    ],
    badge: "Best Value",
  },
};

export function UpgradePrompt({ open, onOpenChange, limitType, currentPlan = 'starter', exportContext }: UpgradePromptProps) {
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
    ? ['professional', 'enterprise']
    : currentPlan === 'professional'
    ? ['enterprise']
    : [];

  const isMaxPlan = availablePlans.length === 0;

  // Export-specific UI: show partial export option when remaining > 0
  if (limitType === 'exports' && exportContext && exportContext.remainingCount > 0) {
    const { requestedCount, remainingCount, usedCount, maxCount, onPartialExport } = exportContext;
    const usagePct = maxCount > 0 ? Math.round((usedCount / maxCount) * 100) : 0;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">Export Exceeds Remaining Quota</DialogTitle>
                <DialogDescription className="text-sm mt-1">
                  You can still export — just not the full amount.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Usage bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monthly usage</span>
                <span className="font-medium">
                  {usedCount.toLocaleString()} / {maxCount.toLocaleString()} properties
                </span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, usagePct)}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {remainingCount.toLocaleString()} exports remaining this month
              </p>
            </div>

            {/* What they're trying to do */}
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Requested</span>
                <span className="font-medium">{requestedCount.toLocaleString()} properties</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Available</span>
                <span className="font-medium text-green-600">{remainingCount.toLocaleString()} properties</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <Button
                className="w-full gap-2"
                onClick={() => {
                  onPartialExport(remainingCount);
                  onOpenChange(false);
                }}
              >
                <Download className="h-4 w-4" />
                Export {remainingCount.toLocaleString()} properties
              </Button>

              {!isMaxPlan && (
                <Button variant="outline" className="w-full gap-2" onClick={handleUpgrade}>
                  <Sparkles className="h-4 w-4" />
                  Upgrade for more exports
                </Button>
              )}

              {isMaxPlan && (
                <p className="text-xs text-center text-muted-foreground">
                  Need more? Contact support for custom enterprise options.
                </p>
              )}

              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
          {/* Show usage summary for export limits when context provided */}
          {limitType === 'exports' && exportContext && exportContext.remainingCount === 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monthly usage</span>
                <span className="font-medium">
                  {exportContext.usedCount.toLocaleString()} / {exportContext.maxCount.toLocaleString()} properties
                </span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }} />
              </div>
              <p className="text-sm text-red-600 font-medium">
                No exports remaining this month
              </p>
            </div>
          )}

          {availablePlans.length > 0 && (
            <>
              <div>
                <h3 className="font-semibold text-ink-900 mb-4">Upgrade to unlock more:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availablePlans.map((planKey) => {
                    const p = PLAN_FEATURES[planKey as keyof typeof PLAN_FEATURES];
                    return (
                      <div
                        key={planKey}
                        className="relative p-4 border-2 border-brand/20 rounded-lg bg-gradient-to-br from-brand/5 to-transparent hover:border-brand/40 transition-all"
                      >
                        {p.badge && (
                          <Badge className="absolute -top-2 right-4 bg-brand text-white">
                            {p.badge}
                          </Badge>
                        )}
                        <div className="mb-3">
                          <h4 className="font-bold text-lg text-ink-900">{p.name}</h4>
                          <p className="text-2xl font-bold text-brand mt-1">{p.price}</p>
                        </div>
                        <ul className="space-y-2">
                          {p.features.map((feature, idx) => (
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
                You're on the Enterprise plan with the maximum monthly limit.
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
