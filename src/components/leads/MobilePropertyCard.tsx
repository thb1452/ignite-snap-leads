import { memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Flame, Sparkles, Download, Heart, Users, Phone } from "lucide-react";
import { SaveHeartButton } from "./SaveHeartButton";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatBlurredStreet } from "@/utils/blurredAddress";
import { usePropertyContacts } from "@/hooks/usePropertyContacts";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
}

interface MobilePropertyCardProps {
  property: {
    id: string;
    address: string;
    street_number?: string | null;
    street_name?: string | null;
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
  isUnlocked?: boolean;
}

function getActionLabel(text: string): { label: string; colorClass: string } | null {
  if (/CALL NOW/i.test(text)) return { label: "CALL NOW", colorClass: "text-red-500 font-semibold" };
  if (/WORTH A CALL/i.test(text)) return { label: "WORTH A CALL", colorClass: "text-orange-400 font-semibold" };
  if (/WATCH/i.test(text)) return { label: "WATCH", colorClass: "text-gray-400 font-semibold" };
  return null;
}

function stripActionLabel(text: string): string {
  return text.replace(/\*?\*?(CALL NOW|WORTH A CALL|WATCH)\*?\*?\.?/gi, "").trim();
}

export const MobilePropertyCard = memo(function MobilePropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick,
  isSaved = false,
  onToggleSaved,
  isUnlocked = true,
}: MobilePropertyCardProps) {
  const { data: contacts } = usePropertyContacts(isUnlocked ? property.id : "");

  const getScoreDot = (score: number | null) => {
    if (!score) return "bg-muted-foreground";
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-500";
    if (score >= 25) return "bg-yellow-500";
    return "bg-green-500";
  };

  const insightText = property.snap_insight || "";
  const actionLabel = getActionLabel(insightText);
  const briefBody = stripActionLabel(insightText);
  const ownerContact = contacts?.find(c => c.name);

  return (
    <div
      className="relative bg-background border-b active:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <div className="p-4 space-y-3">
        {/* Header: lock status + SnapScore */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(property.id)}
                className="h-6 w-6"
              />
            </div>
            {isUnlocked ? (
              <Unlock className="h-3.5 w-3.5 text-teal-500" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className={`text-xs font-semibold uppercase tracking-wider ${isUnlocked ? "text-teal-500" : "text-muted-foreground"}`}>
              {isUnlocked ? "Unlocked" : "Locked"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${getScoreDot(property.snap_score)}`} />
            <span className="text-xs font-bold text-teal-500">SnapScore {property.snap_score || 0}</span>
          </div>
        </div>

        {/* Address */}
        <div>
          <h3 className="property-address font-bold text-lg leading-snug">
            {isUnlocked
              ? formatAddress(property.address)
              : (
                <span className="inline-flex items-center gap-1">
                  <span className="blur-[4px] select-none pointer-events-none">####</span>
                  <span>{property.street_name || property.address?.replace(/^\d+\s*/, '')}</span>
                </span>
              )}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatCity(property.city)}, {property.state} {property.zip}
          </p>
        </div>

        {/* Violation tags */}
        <div className="flex flex-wrap gap-1">
          {property.enforcement_type === 'water_shutoff' && (
            <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200 px-1.5 py-0.5">
              💧 Water Disconnection
            </Badge>
          )}
          {property.violation_types?.filter(v => v !== 'Unknown').slice(0, 3).map((vt, i) => (
            <Badge key={i} variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-orange-50 text-orange-700 border-orange-200 gap-0.5">
              <Flame className="h-3 w-3" />
              {formatViolationType(vt)}
            </Badge>
          ))}
        </div>

        {/* AI Brief - always visible, never collapsed */}
        {insightText && (
          <div className="bg-slate-900 rounded-lg p-3 border border-teal-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs font-semibold text-teal-400">AI Investor Brief</span>
            </div>
            <p className="snap-insight-text text-xs text-slate-300 leading-relaxed">
              {briefBody}{" "}
              {actionLabel && (
                <span className={actionLabel.colorClass}>{actionLabel.label}.</span>
              )}
            </p>
          </div>
        )}

        {/* Owner contact (unlocked only) */}
        {isUnlocked && ownerContact && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{ownerContact.name} <span className="text-muted-foreground">(Owner)</span></span>
            </div>
            {ownerContact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                <a href={`tel:${ownerContact.phone}`} className="text-primary hover:underline" onClick={e => e.stopPropagation()}>
                  {ownerContact.phone}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {isUnlocked ? (
            <>
              <Button
                size="sm"
                className="flex-1 bg-teal-500 hover:bg-teal-600 text-white text-xs"
                onClick={(e) => { e.stopPropagation(); }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export Lead
              </Button>
              {onToggleSaved && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={(e) => { e.stopPropagation(); onToggleSaved(property.id); }}
                >
                  <Heart className={`h-3.5 w-3.5 mr-1.5 ${isSaved ? "fill-red-500 text-red-500" : ""}`} />
                  {isSaved ? "Saved" : "Save"}
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
              onClick={(e) => { e.stopPropagation(); }}
            >
              <Lock className="h-3.5 w-3.5 mr-1.5" />
              Unlock for $0.97
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
