import { Flame, AlertTriangle, Calendar, TrendingUp } from "lucide-react";

interface PropertyMetricsGridProps {
  snapScore: number | null;
  openViolations: number;
  totalViolations: number;
  oldestDaysOpen: number | null;
}

export function PropertyMetricsGrid({
  snapScore,
  openViolations,
  totalViolations,
  oldestDaysOpen,
}: PropertyMetricsGridProps) {
  const getPriorityLevel = (score: number | null) => {
    if (!score) return { label: "Unknown", color: "text-muted-foreground" };
    if (score >= 75) return { label: "Critical", color: "text-destructive" };
    if (score >= 50) return { label: "High", color: "text-orange-600" };
    if (score >= 25) return { label: "Medium", color: "text-yellow-600" };
    return { label: "Low", color: "text-muted-foreground" };
  };

  const priority = getPriorityLevel(snapScore);

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* SnapScore */}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">SnapScore</span>
        </div>
        <div className="text-2xl font-bold text-foreground">
          {snapScore ?? "—"}<span className="text-sm font-normal text-muted-foreground">/100</span>
        </div>
      </div>

      {/* Priority */}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Priority</span>
        </div>
        <div className={`text-2xl font-bold ${priority.color}`}>
          {priority.label}
        </div>
      </div>

      {/* Open Violations */}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Open</span>
        </div>
        <div className="text-2xl font-bold text-foreground">
          {openViolations}
          {totalViolations > openViolations && (
            <span className="text-sm font-normal text-muted-foreground">/{totalViolations}</span>
          )}
        </div>
      </div>

      {/* Oldest */}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Oldest</span>
        </div>
        <div className="text-2xl font-bold text-foreground">
          {oldestDaysOpen ?? "—"}
          <span className="text-sm font-normal text-muted-foreground"> days</span>
        </div>
      </div>
    </div>
  );
}
