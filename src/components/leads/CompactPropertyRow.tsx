import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Download } from "lucide-react";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatBlurredStreet } from "@/utils/blurredAddress";

interface CompactPropertyRowProps {
  property: {
    id: string;
    address: string;
    street_number?: string | null;
    street_name?: string | null;
    city: string;
    state: string;
    zip: string;
    snap_score: number | null;
    total_violations?: number | null;
    open_violations?: number | null;
    violation_types?: string[] | null;
    updated_at?: string | null;
    newest_violation_date?: string | null;
    snap_insight?: string | null;
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
  isUnlocked?: boolean;
  onUnlock?: (propertyId: string) => void;
}

function getActionLabel(text: string): { label: string; colorClass: string } | null {
  if (/CALL NOW/i.test(text)) return { label: "CALL NOW", colorClass: "text-red-500" };
  if (/WORTH A CALL/i.test(text)) return { label: "WORTH A CALL", colorClass: "text-orange-400" };
  if (/WATCH/i.test(text)) return { label: "WATCH", colorClass: "text-gray-400" };
  return null;
}

export function CompactPropertyRow({
  property,
  isSelected,
  onToggleSelect,
  onClick,
  isUnlocked = true,
  onUnlock,
}: CompactPropertyRowProps) {
  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 75) return "bg-red-500 text-white";
    if (score >= 50) return "bg-orange-500 text-white";
    if (score >= 25) return "bg-yellow-500 text-black";
    return "bg-green-500 text-white";
  };

  const actionLabel = property.snap_insight ? getActionLabel(property.snap_insight) : null;

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

      {/* Lock/Unlock icon */}
      <div className="shrink-0">
        {isUnlocked ? (
          <Unlock className="h-3.5 w-3.5 text-teal-500" />
        ) : (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Address */}
      <div className="flex-1 min-w-0">
        <p className="property-address font-medium text-sm truncate leading-tight">
          {isUnlocked ? formatAddress(property.address) : formatBlurredStreet(property, false)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {formatCity(property.city)}, {property.state} {property.zip}
        </p>
      </div>

      {/* Action label */}
      {actionLabel && (
        <span className={`text-[11px] font-bold shrink-0 ${actionLabel.colorClass}`}>
          {actionLabel.label}
        </span>
      )}

      {/* Score Badge */}
      <Badge className={`snap-score-value ${getScoreColor(property.snap_score)} w-10 justify-center shrink-0`}>
        {property.snap_score ?? "—"}
      </Badge>

      {/* Action button */}
      <div className="shrink-0">
        {isUnlocked ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            onClick={(e) => { e.stopPropagation(); }}
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 text-xs px-2 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={(e) => { e.stopPropagation(); onUnlock?.(property.id); }}
          >
            <Lock className="h-3 w-3 mr-1" />
            Unlock
          </Button>
        )}
      </div>
    </div>
  );
}
