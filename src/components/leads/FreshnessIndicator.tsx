import { RefreshCw } from "lucide-react";
import { useWeeklyViolationCount } from "@/hooks/useWeeklyViolationCount";
import { Skeleton } from "@/components/ui/skeleton";

interface FreshnessIndicatorProps {
  className?: string;
}

export function FreshnessIndicator({ className = "" }: FreshnessIndicatorProps) {
  const { data, isLoading } = useWeeklyViolationCount();
  
  if (isLoading) {
    return <Skeleton className="h-4 w-48" />;
  }
  
  return (
    <span className={`text-sm font-medium text-muted-foreground flex items-center gap-1.5 ${className}`}>
      <RefreshCw className="h-3.5 w-3.5 text-primary" />
      <span className="text-primary font-semibold">{data?.formattedCount ?? "0"}</span>
      {" "}new enforcement actions filed this week
    </span>
  );
}
