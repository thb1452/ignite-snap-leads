import { memo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatOwnerName } from "@/utils/formatOwnerName";
import { Lock, Unlock, Sparkles, Heart, Users, Phone, Download, Loader2 } from "lucide-react";
import { ScarcityBadge } from "./ScarcityBadge";
import { usePropertyContacts } from "@/hooks/usePropertyContacts";
import { exportFilteredCsv, getExportErrorToast } from "@/services/export";
import { useToast } from "@/hooks/use-toast";

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
  /** When true, renders a compact single-row layout (List view). */
  compact?: boolean;
}

import { getActionLabel, stripActionLabel } from "@/utils/actionLabelUtils";

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
  const actionLabel = getActionLabel(insightText);
  const briefBody = stripActionLabel(insightText);
  const ownerContact = contacts?.find(c => c.name);

  // ── COMPACT TWO-LINE ROW LAYOUT (List view) ───────────────────────────────
  if (compact) {
    return (
      <div
        className={`flex flex-col justify-center px-3 border-b border-[#1f2937] cursor-pointer transition-colors h-[52px] ${
          isSelected
            ? "bg-[#161d2d] ring-1 ring-inset ring-[#0d9e75]"
            : "bg-[#111827] hover:bg-[#161d2d]"
        }`}
        onClick={onClick}
      >
        {/* ── LINE 1 ── */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Checkbox */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(property.id)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />

          {/* LOCKED / UNLOCKED tag */}
          <span
            className={`text-[9px] font-bold uppercase tracking-widest shrink-0 flex items-center gap-0.5 ${
              isUnlocked ? "text-[#0d9e75]" : "text-slate-400"
            }`}
          >
            {isUnlocked
              ? <><Unlock className="w-2.5 h-2.5" />UNLOCKED</>
              : <><Lock className="w-2.5 h-2.5" />LOCKED</>
            }
          </span>

          {/* Address */}
          <span
            className="text-sm font-bold text-slate-100 truncate shrink-0 max-w-[200px]"
            style={!isUnlocked ? { filter: "blur(4px)", userSelect: "none", pointerEvents: "none" } : undefined}
          >
            {formatAddress(property.address)}
          </span>

          {/* City, State */}
          <span className="text-xs text-slate-400 truncate shrink-0 max-w-[140px]">
            {formatCity(property.city)}, {property.state}
          </span>

          {/* Issue badges */}
          {property.violation_types && property.violation_types.length > 0 && (
            <div className="hidden lg:flex items-center gap-1 shrink-0">
              {property.violation_types.slice(0, 3).map((vt) => (
                <span
                  key={vt}
                  className="text-[10px] font-semibold px-1.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 leading-4 whitespace-nowrap"
                >
                  🔥 {vt}
                </span>
              ))}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* SnapScore */}
          <div className="flex items-center gap-1 shrink-0">
            <div className={`w-2 h-2 rounded-full ${getScoreDot(property.snap_score)}`} />
            <span className="text-sm font-bold text-slate-100 w-8 text-right">
              {property.snap_score || 0}
            </span>
          </div>

          {/* Action button */}
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
              {isExporting
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <><Download className="h-3 w-3 mr-1" />Export Lead</>
              }
            </Button>
          ) : (
            <Button
              size="sm"
              style={{ backgroundColor: "#1a2035", borderColor: "#374151" }}
              className="border text-slate-300 font-semibold text-xs h-7 px-2.5 shrink-0 hover:bg-slate-700 rounded-md"
              onClick={(e) => { e.stopPropagation(); onUnlock?.(property.id); }}
            >
              🔒 Unlock
            </Button>
          )}
        </div>

        {/* ── LINE 2: action label · brief text ── */}
        <div className="flex items-center gap-1.5 pl-[4.5rem] min-w-0 overflow-hidden h-[18px]">
          {actionLabel && (
            <span className={`text-[11px] shrink-0 ${actionLabel.colorClass}`}>
              {actionLabel.label}
            </span>
          )}
          {actionLabel && briefBody && (
            <span className="text-slate-500 text-xs shrink-0">·</span>
          )}
          {briefBody && (
            <span className="text-xs text-slate-400 truncate">{briefBody}</span>
          )}
        </div>
      </div>
    );
  }

  // ── CARD LAYOUT (Map view, default) ───────────────────────────────────────
  return (
    <div className="p-1.5 border-b border-slate-800 bg-slate-950" onClick={onClick}>
      <div className={`bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-xl cursor-pointer transition-all ${isSelected ? "ring-2 ring-teal-500" : ""}`}>

        {/* Header */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(property.id)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
            {isUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-teal-400" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className={`text-xs font-semibold uppercase tracking-wider ${isUnlocked ? "text-teal-400" : "text-slate-400"}`}>
              {isUnlocked ? "Unlocked" : "Locked"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${getScoreDot(property.snap_score)}`} />
            <span className="text-xs font-bold text-teal-400">SnapScore {property.snap_score || 0}</span>
          </div>
        </div>

        {/* Address */}
        <p className="property-address text-sm font-bold mb-0.5 text-slate-100 leading-tight truncate">
          {isUnlocked ? formatAddress(property.address) : (
            <span className="inline-flex items-center gap-2">
              <span className="blur-[4px] select-none pointer-events-none">####</span>
              <span>{property.address?.replace(/^\d+\s*/, "")}</span>
            </span>
          )}
        </p>
        <p className="text-xs text-slate-400 mb-1">
          {formatCity(property.city)}, {property.state} {property.zip}
        </p>

        {/* Violation Tags */}
        {property.violation_types && property.violation_types.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {property.violation_types.slice(0, 3).map((vt) => (
              <span key={vt} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 leading-4">
                🔥 {vt}
              </span>
            ))}
          </div>
        )}

        {/* AI Insight */}
        {insightText && (
          <div className="bg-slate-900 rounded-lg px-2 py-1.5 mb-1.5 border border-teal-500/20">
            {/* Header row: icon + label + action label always pinned right */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <Sparkles className="w-3 h-3 text-teal-400 shrink-0" />
              <span className="text-[11px] font-semibold text-teal-400">AI Investor Brief</span>
              {actionLabel && (
                <span className={`ml-auto text-[11px] font-bold shrink-0 ${actionLabel.colorClass}`}>
                  {actionLabel.label}
                </span>
              )}
            </div>
            {/* Strictly 1 line, no expand */}
            <p className="snap-insight-text text-[11px] text-slate-400 leading-snug overflow-hidden line-clamp-1">
              {briefBody}
            </p>
          </div>
        )}

        {/* Contact / CTA */}
        {isUnlocked ? (
          <div className="space-y-1">
            {ownerContact && (
              <>
                <div className="flex items-center gap-1.5 text-xs">
                  <Users className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-slate-100 truncate">{formatOwnerName(ownerContact.name)} (Owner)</span>
                </div>
                {ownerContact.phone && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <a
                      href={`tel:${ownerContact.phone}`}
                      className="text-slate-100 hover:text-teal-400"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ownerContact.phone}
                    </a>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-1.5 pt-0.5">
              <Button
                size="sm"
                className="bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold text-xs flex-1 h-7 px-2"
                disabled={isExporting}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!isUnlocked) return;
                  setIsExporting(true);
                  try {
                    await exportFilteredCsv({ propertyIds: [property.id], expectedPropertyCount: 1 });
                    toast({
                      title: "Export Complete",
                      description: "Property exported successfully.",
                    });
                  } catch (err: unknown) {
                    const t = getExportErrorToast(err);
                    toast({ title: t.title, description: t.description, variant: t.variant });
                  } finally {
                    setIsExporting(false);
                  }
                }}
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1" />
                )}
                Export Lead
              </Button>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSaved?.(property.id); }}
                className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 transition-colors px-2"
              >
                <Heart
                  className={isSaved ? "text-red-500 fill-red-500" : "text-red-400"}
                  size={12}
                />
                <span className="text-xs font-medium text-slate-200">
                  {isSaved ? "Saved" : "Save"}
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* Locked state: compact inline button row, same height as Export/Save */
          <div className="flex gap-1.5 items-center pt-0.5">
            <Button
              size="sm"
              className="bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold h-7 text-xs px-3"
              onClick={(e) => { e.stopPropagation(); onUnlock?.(property.id); }}
            >
              <Lock className="w-3 h-3 mr-1" />
              Unlock Property
            </Button>
            <ScarcityBadge propertyId={property.id} />
          </div>
        )}
      </div>
    </div>
  );
});
