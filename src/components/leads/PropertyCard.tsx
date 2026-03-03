import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { AlertTriangle, Flame, Clock } from "lucide-react";
import { SaveHeartButton } from "./SaveHeartButton";
import { formatDistanceToNow } from "date-fns";

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
  isSaved?: boolean;
  onToggleSaved?: (id: string) => void;
}

export function PropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick,
  isSaved = false,
  onToggleSaved,
}: PropertyCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 75) return "bg-score-red";
    if (score >= 50) return "bg-score-orange";
    if (score >= 25) return "bg-score-yellow";
    return "bg-score-blue";
  };

  const insightText = property.snap_insight || "";
  const isLong = insightText.length > 160;
  const displayInsight = expanded ? insightText : (isLong ? insightText.slice(0, 157) + "..." : insightText);

  const openCount = property.open_violations ?? 0;
  const totalCount = property.total_violations ?? 0;
  const extraTypes = (property.violation_types?.length ?? 0) > 2 ? (property.violation_types!.length - 2) : 0;

  const freshness = property.updated_at
    ? formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })
    : null;

  // "Heating Up" badge: property updated or new violation in last 7 days
  const isHeatingUp = (() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const updatedAt = property.updated_at ? new Date(property.updated_at).getTime() : 0;
    const newestViolation = (property as any).newest_violation_date ? new Date((property as any).newest_violation_date).getTime() : 0;
    return updatedAt > sevenDaysAgo || newestViolation > sevenDaysAgo;
  })();

  return (
    <div
      className={`group px-3 py-2.5 border-b hover:bg-accent/50 transition-colors cursor-pointer ${
        isSelected ? "bg-accent/30" : "bg-background"
      }`}
      onClick={onClick}
    >
      {/* Row 1: Checkbox + Address + Score */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(property.id)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm leading-tight">
              {formatAddress(property.address)}, {formatCity(property.city)}, {property.state} {property.zip}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {onToggleSaved && (
                <SaveHeartButton
                  isSaved={isSaved}
                  onToggle={() => onToggleSaved(property.id)}
                />
              )}
              <Badge
                className={`${getScoreColor(property.snap_score)} text-white text-xs px-2 py-0.5 h-5 shrink-0 font-bold`}
              >
                {property.snap_score || 0}
              </Badge>
            </div>
          </div>

          {/* Row 2: Status + Violation types + Heating Up */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {isHeatingUp && (
              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-amber-50 text-amber-700 border-amber-300 gap-0.5 animate-pulse">
                <Flame className="h-3 w-3" />
                New Activity
              </Badge>
            )}
            {openCount > 0 ? (
              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-emerald-100 text-emerald-700 border-emerald-200 gap-0.5">
                <AlertTriangle className="h-3 w-3" />
                open
              </Badge>
            ) : totalCount > 0 ? (
              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-rose-100 text-rose-700 border-rose-200">
                closed
              </Badge>
            ) : null}

            {property.enforcement_type === 'water_shutoff' ? (
              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-cyan-50 text-cyan-700 border-cyan-200 gap-0.5">
                💧 Water Disconnection
              </Badge>
            ) : (
              <>
                {property.violation_types && property.violation_types.filter(v => v !== 'Unknown').slice(0, 2).map((vt, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-orange-50 text-orange-700 border-orange-200 gap-0.5">
                    <Flame className="h-3 w-3" />
                    {formatViolationType(vt)}
                  </Badge>
                ))}
                {extraTypes > 0 && (
                  <span className="text-[11px] text-muted-foreground">+{extraTypes}</span>
                )}
              </>
            )}
          </div>

          {/* Row 3: AI Insight */}
          {insightText && (
            <div className="mt-1.5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {displayInsight}
              </p>
              {isLong && (
                <button
                  className="text-xs text-primary hover:underline mt-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                >
                  {expanded ? "Show less" : "Read more ↓"}
                </button>
              )}
            </div>
          )}

          {/* Row 4: Freshness */}
          {freshness && (
            <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground/70">
              <Clock className="h-3 w-3" />
              <span>Snap updated {freshness}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
