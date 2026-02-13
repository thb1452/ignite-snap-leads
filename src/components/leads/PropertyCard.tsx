import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Flame } from "lucide-react";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
}

interface PropertyCardProps {
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    snap_score: number | null;
    snap_insight: string | null;
    updated_at: string | null;
    violations?: Violation[];
    total_violations?: number | null;
    open_violations?: number | null;
    violation_types?: string[] | null;
    enforcement_type?: string;
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
}

export function PropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick
}: PropertyCardProps) {
  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 75) return "bg-score-red text-white";
    if (score >= 50) return "bg-score-orange text-white";
    if (score >= 25) return "bg-score-yellow text-black";
    return "bg-score-blue text-white";
  };

  const insightText = property.snap_insight || "No insight available";

  return (
    <div
      className="group bg-background border-b px-3 py-3 hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(property.id)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 mt-0.5"
        />

        <div className="flex-1 min-w-0">
          {/* Header row: address + score */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm truncate text-foreground">
              {formatAddress(property.address)}
            </span>
            <Badge
              className={`${getScoreColor(property.snap_score)} text-xs px-2 py-0.5 shrink-0`}
            >
              {property.snap_score || 0}
            </Badge>
          </div>

          {/* City/state */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatCity(property.city)}, {property.state} {property.zip}
          </p>

          {/* Violation indicators */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {(property.total_violations != null && property.total_violations > 0) && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className={`h-3.5 w-3.5 ${(property.open_violations ?? 0) > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    (property.open_violations ?? 0) > 0
                      ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {(property.open_violations ?? 0) > 0 ? 'open' : 'closed'}
                </Badge>
              </div>
            )}
            {property.violation_types && property.violation_types.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs text-muted-foreground">
                  {property.violation_types.slice(0, 2).map(formatViolationType).join(", ")}
                  {property.violation_types.length > 2 && ` +${property.violation_types.length - 2}`}
                </span>
              </div>
            )}
          </div>

          {/* AI Insight - full description like mobile */}
          <p className="text-xs text-muted-foreground leading-relaxed mt-2 line-clamp-2">
            {insightText}
          </p>
        </div>
      </div>
    </div>
  );
}
