import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  AlertTriangle,
  Building2,
  Scale,
  Home,
  Flame,
  Wrench,
  Zap,
  Activity,
  Lock
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface EnforcementSignalsProps {
  property: {
    id: string;
    address: string;
    snap_score: number | null;
    snap_insight: string | null;
    distress_signals?: string[];
    total_violations?: number;
    oldest_violation_date?: string | null;
    escalated?: boolean;
    multi_department?: boolean;
    repeat_offender?: boolean;
  } | null;
}

// Escalation signal IDs that require the escalation_alerts feature flag
const ESCALATION_SIGNALS = ['legal_escalation', 'enforcement_escalation'];

// Renamed component but keeping export name for compatibility
export function DistressSignals({ property }: EnforcementSignalsProps) {
  const { hasFeature } = useFeatureAccess();
  const hasEscalationAlerts = hasFeature('escalation_alerts');

  if (!property) {
    return null;
  }

  const signals = property.distress_signals || [];
  const score = property.snap_score ?? 0;

  // Calculate percentile (simplified - in production would compare against all properties)
  const percentile = score >= 90 ? "Top 1%" : 
                     score >= 80 ? "Top 5%" :
                     score >= 70 ? "Top 10%" :
                     score >= 50 ? "Top 25%" : "Below average";

  // Map signal IDs to enforcement-focused labels
  const getSignalConfig = (signal: string) => {
    switch (signal) {
      // Duration signals
      case "chronic_neglect":
      case "extended_enforcement":
        return { icon: Clock, label: "Extended Enforcement", color: "text-[hsl(var(--score-red))]" };
      
      // Repeat activity signals
      case "repeat_violations":
      case "multiple_citations":
        return { icon: AlertTriangle, label: "Multiple Citations", color: "text-[hsl(var(--score-orange))]" };
      case "chronic_offender":
      case "recurring_enforcement":
        return { icon: AlertTriangle, label: "Recurring Enforcement", color: "text-[hsl(var(--score-red))]" };
      
      // Multi-agency signals
      case "multi_department":
        return { icon: Building2, label: "Multi-Department", color: "text-[hsl(var(--score-orange))]" };
      case "coordinated_enforcement":
        return { icon: Building2, label: "Coordinated Enforcement", color: "text-[hsl(var(--score-red))]" };
      
      // Escalation signals
      case "legal_escalation":
      case "enforcement_escalation":
        return { icon: Scale, label: "Escalated Enforcement", color: "text-[hsl(var(--score-red))]" };
      
      // Vacancy signals
      case "vacancy_indicators":
      case "vacancy_citation":
        return { icon: Home, label: "Vacancy Citation", color: "text-[hsl(var(--score-yellow))]" };
      
      // Category-specific signals
      case "fire_damage":
      case "fire_citation":
        return { icon: Flame, label: "Fire Citation", color: "text-[hsl(var(--score-red))]" };
      case "structural_issues":
      case "structural_citation":
        return { icon: Wrench, label: "Structural Citation", color: "text-[hsl(var(--score-orange))]" };
      case "utility_issues":
      case "utility_enforcement":
        return { icon: Zap, label: "Utility Enforcement", color: "text-[hsl(var(--score-yellow))]" };
      
      // Recency signals
      case "hot_enforcement":
      case "recent_activity":
        return { icon: Activity, label: "Recent Activity", color: "text-[hsl(var(--score-orange))]" };
      case "recent_enforcement":
      case "current_enforcement":
        return { icon: Activity, label: "Current Enforcement", color: "text-[hsl(var(--score-yellow))]" };
      
      default:
        return { icon: AlertTriangle, label: signal.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), color: "text-muted-foreground" };
    }
  };

  // Build detected signals list
  const detectedSignals: string[] = [...signals];

  if (property.escalated && !detectedSignals.includes("enforcement_escalation") && !detectedSignals.includes("legal_escalation")) {
    detectedSignals.push("enforcement_escalation");
  }
  if (property.multi_department && !detectedSignals.includes("multi_department")) {
    detectedSignals.push("multi_department");
  }
  if (property.repeat_offender && !detectedSignals.includes("recurring_enforcement") && !detectedSignals.includes("chronic_offender")) {
    detectedSignals.push("recurring_enforcement");
  }

  // Filter out escalation signals for plans without escalation_alerts
  const hasHiddenEscalation = !hasEscalationAlerts && detectedSignals.some(s => ESCALATION_SIGNALS.includes(s));
  const visibleSignals = hasEscalationAlerts
    ? detectedSignals
    : detectedSignals.filter(s => !ESCALATION_SIGNALS.includes(s));

  // Calculate days open if we have oldest_violation_date
  let daysOpen: number | null = null;
  if (property.oldest_violation_date) {
    const oldest = new Date(property.oldest_violation_date);
    daysOpen = Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24));
  }

  const getScoreColor = () => {
    if (score >= 70) return "bg-[hsl(var(--score-red))] text-[hsl(var(--score-red-foreground))]";
    if (score >= 50) return "bg-[hsl(var(--score-orange))] text-[hsl(var(--score-orange-foreground))]";
    if (score >= 25) return "bg-[hsl(var(--score-yellow))] text-[hsl(var(--score-yellow-foreground))]";
    return "bg-[hsl(var(--score-blue))] text-[hsl(var(--score-blue-foreground))]";
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Enforcement Analysis</CardTitle>
          <p className="text-xs text-muted-foreground truncate">{property.address}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Score Display */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-between p-3 rounded-lg border cursor-help">
                <div>
                  <p className="text-sm font-medium">Enforcement Intensity</p>
                  <p className="text-xs text-muted-foreground">{percentile} in jurisdiction</p>
                </div>
                <div className={`px-4 py-2 rounded-lg ${getScoreColor()} text-2xl font-bold`}>
                  {score}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="font-medium mb-1">Enforcement Intensity Score (0-100)</p>
              <p className="text-xs text-muted-foreground mb-2">
                Quantifies municipal enforcement activity based on:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Duration of active enforcement</li>
                <li>• Municipal priority classification</li>
                <li>• Number of agencies involved</li>
                <li>• Data recency</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Does not indicate owner motivation or property value.
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Detected Signals */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Enforcement Signals</p>
            <div className="space-y-1">
              {visibleSignals.length === 0 && !hasHiddenEscalation ? (
                <p className="text-sm text-muted-foreground">No significant enforcement signals detected</p>
              ) : (
                visibleSignals.map((signal) => {
                  const config = getSignalConfig(signal);
                  const Icon = config.icon;
                  return (
                    <div key={signal} className="flex items-center gap-2 p-2 rounded border bg-card">
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <span className="text-sm">{config.label}</span>
                    </div>
                  );
                })
              )}
              {hasHiddenEscalation && (
                <div className="flex items-center gap-2 p-2 rounded border border-dashed border-amber-300 bg-amber-50/50">
                  <Lock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Escalation alerts — upgrade to Enterprise</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2">
            {daysOpen !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 rounded border bg-card text-center cursor-help">
                    <p className="text-lg font-bold">{daysOpen}</p>
                    <p className="text-[10px] text-muted-foreground">Days Active</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Duration of oldest active enforcement case</p>
                </TooltipContent>
              </Tooltip>
            )}
            {(property.total_violations ?? 0) > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2 rounded border bg-card text-center cursor-help">
                    <p className="text-lg font-bold">{property.total_violations}</p>
                    <p className="text-[10px] text-muted-foreground">Citations</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Total enforcement citations on record</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Snap Insight */}
          {property.snap_insight && (
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs font-medium text-muted-foreground mb-1">Enforcement Summary</p>
              <p className="text-sm">{property.snap_insight}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
