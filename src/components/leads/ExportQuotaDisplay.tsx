import { useSubscription } from "@/hooks/useSubscription";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, Infinity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getCreditBalance } from "@/services/credits";

export function ExportQuotaDisplay() {
  const { plan, usage, subscription, loading: subLoading } = useSubscription();
  const {
    isOnTrial,
    hasTrialExpired,
    trialExportsUsed,
    trialExportsRemaining,
    trialExportsLimit,
    loading: trialLoading,
  } = useTrialStatus();

  const loading = subLoading || trialLoading;

  // A paid subscriber must have an active/past_due status that is NOT a trial
  const isPaidSubscriber = !subLoading && subscription && 
    ['active', 'past_due'].includes(subscription.status) && 
    !['trial', 'trialing'].includes(subscription.status) &&
    plan && usage;

  // Trial user: show trial exports (only if NOT on a paid plan)
  if ((isOnTrial || hasTrialExpired) && !isPaidSubscriber) {
    const usedPercentage = (trialExportsUsed / trialExportsLimit) * 100;
    const isLow = trialExportsRemaining <= 10 && trialExportsRemaining > 0;
    const isExhausted = trialExportsRemaining === 0;

    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-lg border border-cyan-200/50 dark:border-cyan-800/50">
        <Download className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0" />

        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
              Trial Exports
            </span>
            {isExhausted ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                All Used
              </Badge>
            ) : isLow ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-500 text-orange-600">
                {trialExportsRemaining} left
              </Badge>
            ) : hasTrialExpired ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-red-500 text-red-600">
                Expired
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Progress
              value={usedPercentage}
              className={`h-1.5 w-20 ${isExhausted ? '[&>div]:bg-destructive' : isLow ? '[&>div]:bg-orange-500' : '[&>div]:bg-cyan-500'}`}
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {trialExportsUsed}/{trialExportsLimit} used
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Paid subscriber: show subscription exports (only for truly active paid plans)
  if (loading || !isPaidSubscriber || !plan || !usage) {
    return null;
  }

  const isUnlimited = plan.max_monthly_exports === -1;
  const remaining = isUnlimited
    ? null
    : Math.max(0, plan.max_monthly_exports - usage.exports_count);
  const usedPercentage = isUnlimited
    ? 0
    : (usage.exports_count / plan.max_monthly_exports) * 100;
  const isLow = !isUnlimited && remaining !== null && remaining <= 2;
  const isExhausted = !isUnlimited && remaining === 0;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg border">
      <Download className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Credits Used
          </span>
          {isUnlimited ? (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Infinity className="h-3 w-3" />
              Unlimited
            </Badge>
          ) : isExhausted ? (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
              Limit Reached
            </Badge>
          ) : isLow ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-500 text-orange-600">
              {remaining?.toLocaleString()} left
            </Badge>
          ) : null}
        </div>

        {!isUnlimited && (
          <div className="flex items-center gap-2">
            <Progress
              value={usedPercentage}
              className={`h-1.5 w-20 ${isExhausted ? '[&>div]:bg-destructive' : isLow ? '[&>div]:bg-orange-500' : ''}`}
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {usage.exports_count.toLocaleString()}/{plan.max_monthly_exports.toLocaleString()} credits
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
