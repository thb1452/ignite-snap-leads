import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
    // Aggregated violation stats from DB
    total_violations?: number | null;
    open_violations?: number | null;
    violation_types?: string[] | null;
    enforcement_type?: string; // 'code_violation' or 'water_shutoff'
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
    if (!score) return "bg-muted";
    if (score >= 75) return "bg-score-red";
    if (score >= 50) return "bg-score-orange";
    if (score >= 25) return "bg-score-yellow";
    return "bg-score-blue";
  };

  const insightText = property.snap_insight || "";
  // Truncate to ~80 chars for single line
  const truncatedInsight = insightText.length > 80 ? insightText.slice(0, 77) + "..." : insightText;

  return (
    <div
      className="group px-3 py-2 border-b hover:bg-accent/50 transition-colors cursor-pointer bg-background"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(property.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0"
        />
        
        <div className="flex-1 min-w-0">
          {/* Row 1: Address + Score */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-sm truncate">
              {formatAddress(property.address)}
            </h3>
            <Badge
              className={`${getScoreColor(property.snap_score)} text-white text-xs px-1.5 py-0 h-5 shrink-0`}
            >
              {property.snap_score || 0}
            </Badge>
          </div>
          
          {/* Row 2: City + Status Badge + Violation Types */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">
              {formatCity(property.city)}, {property.state}
            </span>
            
            {(property.total_violations ?? 0) > 0 && (
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1 py-0 h-4 ${
                  (property.open_violations ?? 0) > 0 
                    ? 'bg-rose-100 text-rose-700 border-rose-200' 
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}
              >
                {(property.open_violations ?? 0) > 0 ? 'open' : 'closed'}
              </Badge>
            )}
            
            {property.violation_types && property.violation_types.length > 0 && (
              <span className="text-[10px] text-muted-foreground truncate">
                {property.violation_types.slice(0, 2).map(formatViolationType).join(", ")}
                {property.violation_types.length > 2 && ` +${property.violation_types.length - 2}`}
              </span>
            )}
          </div>
          
          {/* Row 3: Truncated Insight (1 line max) */}
          {truncatedInsight && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {truncatedInsight}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
