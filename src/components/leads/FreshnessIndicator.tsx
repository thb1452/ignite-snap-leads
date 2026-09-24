import { RefreshCw } from "lucide-react";
import { useWeeklyViolationCount } from "@/hooks/useWeeklyViolationCount";
import { Skeleton } from "@/components/ui/skeleton";
import { CUSTOMER_RECORDS_AVAILABLE } from "@/lib/publicAvailability";

export function FreshnessIndicator({ className = "" }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useWeeklyViolationCount();
  if (!CUSTOMER_RECORDS_AVAILABLE) {
    return <span className={`text-sm text-muted-foreground ${className}`}>Customer record access is paused</span>;
  }
  if (isLoading) return <Skeleton className="h-4 w-48" />;
  if (isError || !data) {
    return <span className={`text-sm text-muted-foreground ${className}`}>Record count unavailable. <button className="underline" onClick={() => void refetch()}>Retry</button></span>;
  }
  return (
    <span title={`Checked ${new Date(data.checkedAt).toLocaleString()}. This measures record ingestion, not filing dates.`} className={`text-sm font-medium text-muted-foreground flex flex-wrap items-center gap-1.5 ${className}`}>
      <RefreshCw className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <span className="text-primary font-semibold">{data.formattedCount}</span>
      accessible records added to Snap in the last 30 days
    </span>
  );
}
