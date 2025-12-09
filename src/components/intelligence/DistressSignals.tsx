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
  Zap
} from "lucide-react";

interface DistressSignalsProps {
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

export function DistressSignals({ property }: DistressSignalsProps) {
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

  const getSignalConfig = (signal: string) => {
    switch (signal) {
      case "chronic_neglect":
        return { icon: Clock, label: "Chronic Neglect", color: "text-[hsl(var(--score-red))]" };
      case "repeat_violations":
        return { icon: AlertTriangle, label: "Repeat Violations", color: "text-[hsl(var(--score-orange))]" };
      case "chronic_offender":
        return { icon: AlertTriangle, label: "Chronic Offender", color: "text-[hsl(var(--score-red))]" };
      case "multi_department":
        return { icon: Building2, label: "Multi-Department", color: "text-[hsl(var(--score-orange))]" };
      case "coordinated_enforcement":
        return { icon: Building2, label: "Coordinated Enforcement", color: "text-[hsl(var(--score-red))]" };
      case "legal_escalation":
        return { icon: Scale, label: "Legal Escalation", color: "text-[hsl(var(--score-red))]" };
      case "vacancy_indicators":
        return { icon: Home, label: "Vacancy Indicators", color: "text-[hsl(var(--score-yellow))]" };
      case "fire_damage":
        return { icon: Flame, label: "Fire Damage", color: "text-[hsl(var(--score-red))]" };
      case "structural_issues":
        return { icon: Wrench, label: "Structural Issues", color: "text-[hsl(var(--score-orange))]" };
      case "utility_issues":
        return { icon: Zap, label: "Utility Issues", color: "text-[hsl(var(--score-yellow))]" };
      default:
        return { icon: AlertTriangle, label: signal, color: "text-muted-foreground" };
    }
  };

  // Build detected signals list
  const detectedSignals: string[] = [...signals];
  
  if (property.escalated && !detectedSignals.includes("legal_escalation")) {
    detectedSignals.push("legal_escalation");
  }
  if (property.multi_department && !detectedSignals.includes("multi_department")) {
    detectedSignals.push("multi_department");
  }
  if (property.repeat_offender && !detectedSignals.includes("chronic_offender")) {
    detectedSignals.push("chronic_offender");
  }

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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Distress Analysis</CardTitle>
        <p className="text-xs text-muted-foreground truncate">{property.address}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <p className="text-sm font-medium">SnapScore</p>
            <p className="text-xs text-muted-foreground">{percentile} in jurisdiction</p>
          </div>
          <div className={`px-4 py-2 rounded-lg ${getScoreColor()} text-2xl font-bold`}>
            {score}
          </div>
        </div>

        {/* Detected Signals */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Detected Signals</p>
          <div className="space-y-1">
            {detectedSignals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No distress signals detected</p>
            ) : (
              detectedSignals.map((signal) => {
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
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2">
          {daysOpen !== null && (
            <div className="p-2 rounded border bg-card text-center">
              <p className="text-lg font-bold">{daysOpen}</p>
              <p className="text-[10px] text-muted-foreground">Days Open</p>
            </div>
          )}
          {(property.total_violations ?? 0) > 0 && (
            <div className="p-2 rounded border bg-card text-center">
              <p className="text-lg font-bold">{property.total_violations}</p>
              <p className="text-[10px] text-muted-foreground">Violations</p>
            </div>
          )}
        </div>

        {/* Snap Insight */}
        {property.snap_insight && (
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">AI Insight</p>
            <p className="text-sm">{property.snap_insight}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
