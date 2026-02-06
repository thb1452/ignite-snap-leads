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
      className="group flex items-center gap-2 px-3 py-1.5 border-b hover:bg-accent/50 transition-colors cursor-pointer bg-background"
      onClick={onClick}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleSelect(property.id)}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />
      
      {/* Main content - single row with address info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">
            {formatAddress(property.address)}
          </span>
          <Badge
            className={`${getScoreColor(property.snap_score)} text-white text-xs px-1.5 py-0 h-5 shrink-0`}
          >
            {property.snap_score || 0}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {formatCity(property.city)}, {property.state}
          </span>
          {(property.open_violations ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-rose-100 text-rose-700 border-rose-200 shrink-0">
              open
            </Badge>
          )}
          {property.violation_types && property.violation_types.length > 0 && (
            <span className="truncate text-[10px]">
              {property.violation_types.slice(0, 2).map(formatViolationType).join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
