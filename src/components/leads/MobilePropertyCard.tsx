import { memo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Sparkles, Heart, Users, Phone, Download, Loader2 } from "lucide-react";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatBlurredStreet } from "@/utils/blurredAddress";
import { formatOwnerName } from "@/utils/formatOwnerName";
import { usePropertyContacts } from "@/hooks/usePropertyContacts";
import { exportFilteredCsv, getExportErrorToast } from "@/services/export";
import { useToast } from "@/hooks/use-toast";
import { getBriefPreview, getDisplayActionLabel } from "@/utils/actionLabelUtils";

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
  onUnlock?: (propertyId: string) => void;
}

export const MobilePropertyCard = memo(function MobilePropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick,
  isSaved = false,
  onToggleSaved,
  isUnlocked = true,
  onUnlock,
}: MobilePropertyCardProps) {
  const { data: contacts } = usePropertyContacts(isUnlocked ? property.id : "");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const getScoreDot = (score: number | null) => {
    if (!score) return "bg-slate-500";
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-400";
    if (score >= 25) return "bg-yellow-400";
    return "bg-teal-500";
  };

  const insightText = property.snap_insight || "";
  const actionLabel = insightText
    ? getDisplayActionLabel(insightText, {
        snapScore: property.snap_score,
        openViolations: property.open_violations,
        enforcementType: property.enforcement_type,
        violationTypes: property.violation_types,
      })
    : null;
  const briefPreview = insightText ? getBriefPreview(insightText, 2, 180) : "";
  const ownerContact = contacts?.find((c) => c.name);

  return (
    <div className="p-3 border-b border-slate-800 bg-slate-950" onClick={onClick}>
      <div className={`bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-xl cursor-pointer transition-all ${isSelected ? "ring-2 ring-teal-500" : ""}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(property.id)} className="h-5 w-5" />
            </div>
            {isUnlocked ? <Unlock className="w-4 h-4 text-teal-400" /> : <Lock className="w-4 h-4 text-slate-400" />}
            <span className={`text-xs font-semibold uppercase tracking-wider ${isUnlocked ? "text-teal-400" : "text-slate-400"}`}>
              {isUnlocked ? "Unlocked" : "Locked"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${getScoreDot(property.snap_score)}`} />
            <span className="text-xs font-bold text-teal-400">SnapScore {property.snap_score || 0}</span>
          </div>
        </div>

        <p className="property-address text-lg font-bold mb-1 text-slate-100">
          {isUnlocked ? (
            formatAddress(property.address)
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="blur-[4px] select-none pointer-events-none">1423</span>
              <span>{formatBlurredStreet(property, false)}</span>
            </span>
          )}
        </p>
        <p className="text-sm text-slate-400 mb-2">
          {formatCity(property.city)}, {property.state} {property.zip}
        </p>

        {property.violation_types && property.violation_types.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {property.violation_types.slice(0, 4).map((vt) => (
              <span key={vt} className="inline-flex max-w-full items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20" title={vt}>
                🔥 {vt}
              </span>
            ))}
          </div>
        )}

        {insightText && (
          <div className="bg-slate-900 rounded-lg p-3 mb-4 border border-teal-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs font-semibold text-teal-400">AI Investor Brief</span>
            </div>
            {briefPreview && <p className="snap-insight-text text-xs text-slate-400 leading-relaxed break-words">{briefPreview}</p>}
            {actionLabel && <p className={`mt-1 text-xs leading-tight ${actionLabel.colorClass}`}>{actionLabel.label}</p>}
          </div>
        )}

        {isUnlocked ? (
          <div className="space-y-2">
            <div className="flex gap-2 mt-1">
              <Button
                size="sm"
                className="bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold text-xs flex-1"
                disabled={isExporting}
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsExporting(true);
                  try {
                    await exportFilteredCsv({ propertyIds: [property.id], expectedPropertyCount: 1 });
                    toast({ title: "Export Complete", description: "Property exported successfully." });
                  } catch (err: unknown) {
                    const t = getExportErrorToast(err);
                    toast({ title: t.title, description: t.description, variant: t.variant });
                  } finally {
                    setIsExporting(false);
                  }
                }}
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export Lead
              </Button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSaved?.(property.id);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <Heart className={isSaved ? "text-red-500 fill-red-500" : "text-red-400"} size={18} />
                <span className="text-sm font-medium text-slate-200">{isSaved ? "Saved" : "Save"}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Button
              className="w-full bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold"
              onClick={(e) => {
                e.stopPropagation();
                onUnlock?.(property.id);
              }}
            >
              <Lock className="w-4 h-4 mr-2" />
              Unlock Property
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">Owner contact info coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
});
