import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Flame } from "lucide-react";
import { formatAddress, formatCity } from "@/utils/formatAddress";

interface CompactPropertyRowProps {
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    snap_score: number | null;
    total_violations?: number | null;
    open_violations?: number | null;
    violation_types?: string[] | null;
    updated_at?: string | null;
    newest_violation_date?: string | null;
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
}

export function CompactPropertyRow({
  property,
  isSelected,
  onToggleSelect,
  onClick,
}: CompactPropertyRowProps) {
  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 75) return "bg-score-red text-score-red-foreground";
    if (score >= 50) return "bg-score-orange text-score-orange-foreground";
    if (score >= 25) return "bg-score-yellow text-score-yellow-foreground";
    return "bg-score-blue text-score-blue-foreground";
  };

  const openCount = property.open_violations ?? 0;
  const totalCount = property.total_violations ?? 0;

  // "Heating Up" badge
  const isHeatingUp = (() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const updatedAt = property.updated_at ? new Date(property.updated_at).getTime() : 0;
    const newestViolation = property.newest_violation_date ? new Date(property.newest_violation_date).getTime() : 0;
    return updatedAt > sevenDaysAgo || newestViolation > sevenDaysAgo;
  })();

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 border-b hover:bg-accent/50 transition-colors cursor-pointer ${
        isSelected ? "bg-accent/30" : "bg-background"
      }`}
      onClick={onClick}
    >
      {/* Checkbox */}
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleSelect(property.id)}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />

      {/* Address - Main Column */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate leading-tight">
          {formatAddress(property.address)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {formatCity(property.city)}, {property.state} {property.zip}
        </p>
      </div>

      {/* Heating Up + Status Badge */}
      {isHeatingUp && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 h-[16px] bg-amber-50 text-amber-700 border-amber-300 gap-0.5 shrink-0">
          <Flame className="h-2.5 w-2.5" />
          🔥
        </Badge>
      )}
      <div className="shrink-0">
        {totalCount > 0 ? (
          <Badge
            variant="outline"
            className={`text-xs px-1.5 py-0 h-5 ${
              openCount > 0
                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                : "bg-rose-100 text-rose-700 border-rose-200"
            }`}
          >
            {openCount > 0 ? `${openCount} open` : "closed"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Violations Count */}
      <div className="w-12 text-right shrink-0">
        <span className="text-xs text-muted-foreground">
          {totalCount > 0 ? `${totalCount}` : "—"}
        </span>
      </div>

      {/* Score Badge */}
      <Badge className={`${getScoreColor(property.snap_score)} w-10 justify-center shrink-0`}>
        {property.snap_score ?? "—"}
      </Badge>
    </div>
  );
}
