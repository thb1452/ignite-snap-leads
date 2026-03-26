import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles, TrendingUp, Download, AlertTriangle, Pencil, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { LimitType, PlanTierName } from "@/types/subscription";

export interface ExportContext {
  requestedCount: number;
  remainingCount: number;
  usedCount: number;
  maxCount: number;
  listId?: string;
  onPartialExport?: (count: number) => void;
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
    description: "Advanced filtering is available on Pro and Elite plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  violation_filtering: {
    title: "Violation Filtering Not Available",
    description: "Violation type filtering is available on Pro and Elite plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  rolling_intelligence: {
    title: "Rolling Intelligence Not Available",
    description: "30-day rolling intelligence is available on Pro and Elite plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
  escalation_alerts: {
    title: "Escalation Alerts Not Available",
    description: "Escalation pattern alerts are available on Elite plans.",
    icon: Sparkles,
    color: "text-purple-500",
  },
};

const PLAN_FEATURES = {
  starter: {
    name: "Starter",
    price: "$49/mo",
    badge: "",
    features: [
      "150 addresses/month",
      "150 exports/month",
      "Code violation data",
      "Basic filters",
    ],
  },
  professional: {
    name: "Pro",
    price: "$99/mo",
    features: [
      "400 addresses/month",
      "400 exports/month",
      "Pressure Level™ filters",
      "Priority support",
    ],
    badge: "Most Popular",
  },
  enterprise: {
    name: "Elite",
    price: "$199/mo",
    features: [
      "1,000 addresses/month",
      "1,000 exports/month",
      "Water shutoff data",
      "All Pro features",
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

  const handleEditList = () => {
    if (exportContext?.listId) {
      onOpenChange(false);
      navigate(`/lists/${exportContext.listId}`);
    }
  };

  // Export-specific UI: handle different scenarios
  if (limitType === 'exports' && exportContext) {
    const { requestedCount, remainingCount, usedCount, maxCount, onPartialExport, listId } = exportContext;
    const exceedsTotalLimit = requestedCount > maxCount;

    // Case 1: List size exceeds total monthly limit entirely
    if (exceedsTotalLimit) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    {maxCount === 0 ? "No Export Plan" : "List Exceeds Monthly Limit"}
                  </DialogTitle>
                  <DialogDescription className="text-sm mt-1">
                    {maxCount === 0
                      ? "Subscribe to export properties as CSV, or unlock addresses individually at $0.97 each."
                      : "This list is too large for a single export on your plan."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 mt-2">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-red-800">List size</span>
                  <span className="font-bold text-red-900">{requestedCount.toLocaleString()} properties</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-800">Your monthly limit</span>
                  <span className="font-bold text-red-900">{maxCount.toLocaleString()} properties</span>
                </div>
                <div className="border-t border-red-200 pt-2 text-sm text-red-700">
                  {maxCount > 0
                    ? `This list requires ${Math.ceil(requestedCount / maxCount)} months to fully export on your current plan.`
                    : "You have no exports remaining on your current plan."}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-ink-900">Your options:</h4>
                <ul className="space-y-2 text-sm text-ink-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                    <span><strong>Upgrade your plan</strong> for a higher monthly limit</span>
                  </li>
                  {remainingCount > 0 && onPartialExport && (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span><strong>Export {remainingCount.toLocaleString()} now</strong> (remaining properties saved in list)</span>
                    </li>
                  )}
                  {listId && (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                      <span><strong>Edit list</strong> to remove properties and export a smaller list</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="space-y-2 pt-2">
                {!isMaxPlan && (
                  <Button className="w-full gap-2" onClick={handleUpgrade}>
                    <Sparkles className="h-4 w-4" />
                    Upgrade for higher limits
                  </Button>
                )}

                {remainingCount > 0 && onPartialExport && (
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={() => {
                      onPartialExport(remainingCount);
                      onOpenChange(false);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Export {remainingCount.toLocaleString()} now
                  </Button>
                )}

                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => { onOpenChange(false); navigate('/pricing'); }}
                >
                  <DollarSign className="h-4 w-4" />
                  Pay-as-you-go — ${(requestedCount * 0.97).toFixed(2)} ($0.97 each)
                </Button>

                {listId && (
                  <Button className="w-full gap-2" variant="outline" onClick={handleEditList}>
                    <Pencil className="h-4 w-4" />
                    Edit List
                  </Button>
                )}

                {isMaxPlan && (
                  <p className="text-xs text-center text-muted-foreground">
                    You're on the max plan. Contact support for custom enterprise options.
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

    // Case 2: Quota exhausted (no remaining exports)
    if (remainingCount === 0) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Export Limit Reached</DialogTitle>
                  <DialogDescription className="text-sm mt-1">
                    You've used all your exports for this billing period.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 mt-2">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-red-800">List size</span>
                  <span className="font-bold text-red-900">{requestedCount.toLocaleString()} properties</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-800">Monthly usage</span>
                  <span className="font-bold text-red-900">{usedCount.toLocaleString()} / {maxCount.toLocaleString()} used</span>
                </div>
                <div className="border-t border-red-200 pt-2 text-sm text-red-700">
                  No exports remaining this month. Your quota resets at the start of your next billing cycle.
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-ink-900">Your options:</h4>
                <ul className="space-y-2 text-sm text-ink-700">
                  {!isMaxPlan && (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                      <span><strong>Upgrade your plan</strong> for a higher monthly limit</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                    <span><strong>Wait for next billing cycle</strong> when your quota resets</span>
                  </li>
                  {listId && (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                      <span><strong>Edit list</strong> to prepare for export when quota resets</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="space-y-2 pt-2">
                {!isMaxPlan && (
                  <Button className="w-full gap-2" onClick={handleUpgrade}>
                    <Sparkles className="h-4 w-4" />
                    Upgrade for higher limits
                  </Button>
                )}

                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => { onOpenChange(false); navigate('/pricing'); }}
                >
                  <DollarSign className="h-4 w-4" />
                  Pay-as-you-go — ${(requestedCount * 0.97).toFixed(2)} ($0.97 each)
                </Button>

                {listId && (
                  <Button className="w-full gap-2" variant="outline" onClick={handleEditList}>
                    <Pencil className="h-4 w-4" />
                    Edit List
                  </Button>
                )}

                {isMaxPlan && (
                  <p className="text-xs text-center text-muted-foreground">
                    You're on the max plan. Contact support for custom enterprise options.
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

    // Case 3: Partial export available (remaining quota > 0 but < requested)
    // Show this modal regardless of whether onPartialExport is provided
    if (remainingCount > 0 && remainingCount < requestedCount) {
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
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-amber-800">List size</span>
                  <span className="font-bold text-amber-900">{requestedCount.toLocaleString()} properties</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-800">Available quota</span>
                  <span className="font-bold text-amber-900">{remainingCount.toLocaleString()} properties</span>
                </div>
                <div className="border-t border-amber-200 pt-2 text-sm text-amber-700">
                  You've used {usedCount.toLocaleString()} of {maxCount.toLocaleString()} exports this month.
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-ink-900">Your options:</h4>
                <ul className="space-y-2 text-sm text-ink-700">
                  {!isMaxPlan && (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                      <span><strong>Upgrade your plan</strong> for a higher monthly limit</span>
                    </li>
                  )}
                  {onPartialExport && (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span><strong>Export {remainingCount.toLocaleString()} now</strong> (partial export of available quota)</span>
                    </li>
                  )}
                  {listId && (
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                      <span><strong>Edit list</strong> to remove properties and export a smaller list</span>
                    </li>
                  )}
                </ul>
              </div>

              <div className="space-y-2 pt-2">
                {!isMaxPlan && (
                  <Button className="w-full gap-2" onClick={handleUpgrade}>
                    <Sparkles className="h-4 w-4" />
                    Upgrade for higher limits
                  </Button>
                )}

                {onPartialExport && (
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={() => {
                      onPartialExport(remainingCount);
                      onOpenChange(false);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Export {remainingCount.toLocaleString()} now
                  </Button>
                )}

                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => { onOpenChange(false); navigate('/pricing'); }}
                >
                  <DollarSign className="h-4 w-4" />
                  Pay-as-you-go — ${(requestedCount * 0.97).toFixed(2)} ($0.97 each)
                </Button>

                {listId && (
                  <Button className="w-full gap-2" variant="outline" onClick={handleEditList}>
                    <Pencil className="h-4 w-4" />
                    Edit List
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

    // Fallback: If exportContext was provided but didn't match any case above,
    // this is an edge case (e.g., remainingCount >= requestedCount but modal still shown).
    // Show a generic partial export modal with available context.
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">Export Limit Notice</DialogTitle>
                <DialogDescription className="text-sm mt-1">
                  Review your export quota before proceeding.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-amber-800">Requested</span>
                <span className="font-bold text-amber-900">{requestedCount.toLocaleString()} properties</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-amber-800">Available</span>
                <span className="font-bold text-amber-900">{remainingCount.toLocaleString()} properties</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-amber-800">Monthly usage</span>
                <span className="font-bold text-amber-900">{usedCount.toLocaleString()} / {maxCount.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              {!isMaxPlan && (
                <Button className="w-full gap-2" onClick={handleUpgrade}>
                  <Sparkles className="h-4 w-4" />
                  Upgrade for higher limits
                </Button>
              )}

              {listId && (
                <Button className="w-full gap-2" variant="outline" onClick={handleEditList}>
                  <Pencil className="h-4 w-4" />
                  Edit List
                </Button>
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

  // Case 5: Feature-based limits (non-export) - simpler design
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand/20 to-brand/5 flex items-center justify-center">
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
                <h3 className="font-semibold text-ink-900 mb-4">Upgrade to unlock:</h3>
                <div className="space-y-3">
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
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-lg text-ink-900">{p.name}</h4>
                          <p className="text-lg font-bold text-brand">{p.price}</p>
                        </div>
                        <ul className="space-y-1">
                          {p.features.slice(0, 3).map((feature, idx) => (
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

              <div className="space-y-2 pt-2">
                <Button className="w-full gap-2" onClick={handleUpgrade}>
                  <Sparkles className="h-4 w-4" />
                  Upgrade for higher limits
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {availablePlans.length === 0 && (
            <div className="text-center py-4">
              <p className="text-ink-700 mb-2">
                You're on the Elite plan with maximum features.
              </p>
              <p className="text-sm text-ink-500 mb-4">
                Need custom options? Contact support.
              </p>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
