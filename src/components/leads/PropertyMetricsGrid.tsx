import { AlertTriangle, Calendar, TrendingUp, Activity } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  // Map score to enforcement intensity level (neutral terminology)
  const getIntensityLevel = (score: number | null) => {
    if (!score) return { label: "Unknown", color: "text-muted-foreground" };
    if (score >= 75) return { label: "Critical", color: "text-destructive" };
    if (score >= 50) return { label: "High", color: "text-orange-600" };
    if (score >= 25) return { label: "Moderate", color: "text-yellow-600" };
    return { label: "Low", color: "text-muted-foreground" };
  };

  const intensity = getIntensityLevel(snapScore);

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-3">
        {/* SnapScore - Enforcement Intensity */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="rounded-xl border bg-card p-3 cursor-help">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">SnapScore</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {snapScore ?? "—"}<span className="text-sm font-normal text-muted-foreground">/100</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Enforcement Intensity Score</p>
            <p className="text-xs text-muted-foreground">
              Quantifies volume, priority, and duration of municipal enforcement activity. 
              Does not indicate owner motivation or property value.
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Intensity Level */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="rounded-xl border bg-card p-3 cursor-help">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Intensity</span>
              </div>
              <div className={`text-2xl font-bold ${intensity.color}`}>
                {intensity.label}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Enforcement Intensity Level</p>
            <p className="text-xs text-muted-foreground">
              Critical (75+), High (50-74), Moderate (25-49), Low (0-24). 
              Based on municipal enforcement metrics.
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Open Violations */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="rounded-xl border bg-card p-3 cursor-help">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Active</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {openViolations}
                {totalViolations > openViolations && (
                  <span className="text-sm font-normal text-muted-foreground">/{totalViolations}</span>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Active Citations</p>
            <p className="text-xs text-muted-foreground">
              Number of open enforcement cases. Total includes resolved cases.
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Duration */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="rounded-xl border bg-card p-3 cursor-help">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Duration</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {oldestDaysOpen ?? "—"}
                <span className="text-sm font-normal text-muted-foreground"> days</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium mb-1">Enforcement Duration</p>
            <p className="text-xs text-muted-foreground">
              Days since oldest open enforcement action began.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
