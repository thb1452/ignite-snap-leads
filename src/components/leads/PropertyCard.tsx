import { memo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatBlurredStreet } from "@/utils/blurredAddress";
import { Lock, Unlock, Sparkles, Heart, Download, Loader2 } from "lucide-react";
import { exportFilteredCsv, getExportErrorToast } from "@/services/export";
import { useToast } from "@/hooks/use-toast";
import { getBriefPreview, getDisplayActionLabel } from "@/utils/actionLabelUtils";

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
    street_number?: string | null;
    street_name?: string | null;
    city: string;
    state: string;
    zip: string;
    snap_score: number | null;
    snap_insight: string | null;
    updated_at: string | null;
    newest_violation_date?: string | null;
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
  compact?: boolean;
}

export const PropertyCard = memo(function PropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick,
  isSaved = false,
  onToggleSaved,
  isUnlocked = true,
  onUnlock,
  compact = false,
}: PropertyCardProps) {
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
  const briefPreview = insightText ? getBriefPreview(insightText, compact ? 1 : 3, compact ? 96 : 280) : "";

  if (compact) {
    return (
      <div
        className={`flex flex-col justify-center px-3 py-2 border-b border-[#1f2937] cursor-pointer transition-colors min-h-[68px] ${
          isSelected ? "bg-[#161d2d] ring-1 ring-inset ring-[#0d9e75]" : "bg-[#111827] hover:bg-[#161d2d]"
        }`}
        onClick={onClick}
      >
        <div className="flex items-start gap-2 min-w-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(property.id)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />

          <span
            className={`text-[9px] font-bold uppercase tracking-widest shrink-0 flex items-center gap-0.5 ${
              isUnlocked ? "text-[#0d9e75]" : "text-slate-400"
            }`}
          >
            {isUnlocked ? <><Unlock className="w-2.5 h-2.5" />UNLOCKED</> : <><Lock className="w-2.5 h-2.5" />LOCKED</>}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSaved?.(property.id);
            }}
            className="flex items-center justify-center h-6 w-6 rounded-md border border-slate-600 bg-slate-700 hover:bg-slate-600 transition-colors shrink-0"
            aria-label={isSaved ? "Remove from saved" : "Save property"}
          >
            <Heart className={isSaved ? "text-red-500 fill-red-500" : "text-red-400"} size={12} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 min-w-0">
              <span className={`text-sm font-bold text-slate-100 min-w-0 flex-1 truncate leading-tight${!isUnlocked ? " blur-[4px] select-none" : ""}`}>
                {isUnlocked ? formatAddress(property.address) : formatBlurredStreet(property, false)}
              </span>

              <span className="text-xs text-slate-400 shrink-0 max-w-[140px] truncate leading-tight">
                {formatCity(property.city)}, {property.state}
              </span>
            </div>

            {property.violation_types && property.violation_types.length > 0 && (
              <div className="flex items-center gap-1 shrink-0 mt-1">
                {property.violation_types.slice(0, 3).map((vt) => (
                  <span
                    key={vt}
                    className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-semibold px-1.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 leading-4"
                    title={vt}
                  >
                    🔥 {vt}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 self-center">
            <div className={`w-2 h-2 rounded-full ${getScoreDot(property.snap_score)}`} />
            <span className="text-sm font-bold text-slate-100 w-8 text-right">{property.snap_score || 0}</span>
          </div>

          {isUnlocked ? (
            <Button
              size="sm"
              style={{ backgroundColor: "#0d9e75" }}
              className="hover:opacity-90 text-white font-semibold text-xs h-7 px-2.5 shrink-0 rounded-md"
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
              {isExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Download className="h-3 w-3 mr-1" />Export Lead</>}
            </Button>
          ) : (
            <Button
              size="sm"
              style={{ backgroundColor: "#1a2035", borderColor: "#374151" }}
              className="border text-slate-300 font-semibold text-xs h-7 px-2.5 shrink-0 hover:bg-slate-700 rounded-md"
              onClick={(e) => {
                e.stopPropagation();
                onUnlock?.(property.id);
              }}
            >
              🔒 Unlock
            </Button>
          )}
        </div>

        {(briefPreview || actionLabel) && (
          <div className="flex flex-col gap-0.5 pl-[4.5rem] min-w-0 mt-1">
            {briefPreview && (
              <p className="text-[11px] text-slate-400 leading-tight whitespace-normal break-words">{briefPreview}</p>
            )}
            {actionLabel && (
              <p className={`text-[11px] leading-tight ${actionLabel.colorClass}`}>{actionLabel.label}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-1.5 py-0.5 border-b border-slate-800 bg-slate-950" onClick={onClick}>
      <div className={`bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 cursor-pointer transition-all ${isSelected ? "ring-1 ring-teal-500" : ""}`}>
        {/* Row 1: checkbox + lock + address + city + violations + score */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(property.id)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 h-3.5 w-3.5"
          />
          {isUnlocked ? <Unlock className="w-3 h-3 text-teal-400 shrink-0" /> : <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
          <span className={`text-[9px] font-semibold uppercase tracking-wider shrink-0 ${isUnlocked ? "text-teal-400" : "text-slate-400"}`}>
            {isUnlocked ? "UNLOCKED" : "LOCKED"}
          </span>

          <p className={`text-xs font-bold text-slate-100 leading-tight truncate min-w-0${!isUnlocked ? " blur-[4px] select-none" : ""}`}>
            {isUnlocked ? formatAddress(property.address) : formatBlurredStreet(property, false)}
          </p>

          <span className="text-[10px] text-slate-400 shrink-0">
            {formatCity(property.city)}, {property.state}
          </span>

          {property.violation_types && property.violation_types.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {property.violation_types.slice(0, 2).map((vt) => (
                <span key={vt} className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-medium px-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 leading-3.5" title={vt}>
                  🔥 {vt}
                </span>
              ))}
            </div>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1 shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${getScoreDot(property.snap_score)}`} />
            <span className="text-[10px] font-bold text-teal-400">SnapScore {property.snap_score || 0}</span>
          </div>
        </div>

        {/* Row 2: action label + brief preview */}
        {(actionLabel || briefPreview) && (
          <div className="flex items-start gap-1.5 min-w-0 pl-5 mt-0.5">
            {actionLabel && (
              <span className={`text-[9px] font-bold uppercase shrink-0 mt-px ${actionLabel.colorClass}`}>{actionLabel.label}</span>
            )}
            {briefPreview && (
              <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3 whitespace-normal flex-1 min-w-0">{briefPreview}</p>
            )}
          </div>
        )}

        {/* Row 3: buttons */}
        <div className="flex items-center justify-end gap-1 min-w-0 pl-5">
          {isUnlocked ? (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                className="bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold text-[10px] h-5 px-2"
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
                {isExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Download className="h-3 w-3 mr-0.5" />Export</>}
              </Button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSaved?.(property.id);
                }}
                className="flex items-center justify-center h-5 w-5 rounded border border-slate-600 bg-slate-700 hover:bg-slate-600 transition-colors"
                aria-label={isSaved ? "Remove from saved" : "Save property"}
              >
                <Heart className={isSaved ? "text-red-500 fill-red-500" : "text-red-400"} size={9} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSaved?.(property.id);
                }}
                className="flex items-center justify-center h-5 w-5 rounded border border-slate-600 bg-slate-700 hover:bg-slate-600 transition-colors"
                aria-label={isSaved ? "Remove from saved" : "Save property"}
              >
                <Heart className={isSaved ? "text-red-500 fill-red-500" : "text-red-400"} size={9} />
              </button>
              <Button
                size="sm"
                className="bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold h-5 text-[10px] px-2 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnlock?.(property.id);
                }}
              >
                <Lock className="w-3 h-3 mr-0.5" />
                Unlock
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
