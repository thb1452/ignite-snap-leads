import { useSubscription } from "@/hooks/useSubscription";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, Infinity } from "lucide-react";

export function ExportQuotaDisplay() {
  const { plan, usage, loading } = useSubscription();

  if (loading || !plan || !usage) {
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
            Property Exports
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
              {usage.exports_count.toLocaleString()}/{plan.max_monthly_exports.toLocaleString()} properties
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
