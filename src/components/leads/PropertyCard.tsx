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
}

function getActionLabel(text: string): { label: string; colorClass: string } | null {
  if (/CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY/i.test(text))
    return { label: "CALL NOW", colorClass: "text-red-500 font-bold" };
  if (/WORTH A CALL|MONITOR/i.test(text))
    return { label: "WORTH A CALL", colorClass: "text-orange-400 font-bold" };
  if (/WATCH|LOW PRIORITY|WATCH\/PASS/i.test(text))
    return { label: "WATCH", colorClass: "text-gray-400 font-bold" };
  return null;
}

function stripActionLabel(text: string): string {
  return text
    .replace(/\*?\*?(CALL NOW|WORTH A CALL|WATCH|HIGH OPPORTUNITY|GOOD OPPORTUNITY|MONITOR|LOW PRIORITY|WATCH\/PASS)\*?\*?\.?/gi, "")
    .replace(/\*\*/g, "")
    .trim();
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

  return (
    <div className="p-2 border-b border-slate-800 bg-slate-950" onClick={onClick}>
      <div className={`bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-xl cursor-pointer transition-all ${isSelected ? "ring-2 ring-teal-500" : ""}`}>

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
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
        <p className="property-address text-base font-bold mb-0.5 text-slate-100 leading-tight">
          {isUnlocked ? formatAddress(property.address) : (
            <span className="inline-flex items-center gap-2">
              <span className="blur-[4px] select-none pointer-events-none">####</span>
              <span>{property.address?.replace(/^\d+\s*/, "")}</span>
            </span>
          )}
        </p>
        <p className="text-xs text-slate-400 mb-1.5">
          {formatCity(property.city)}, {property.state} {property.zip}
        </p>

        {/* Violation Tags */}
        {property.violation_types && property.violation_types.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {property.violation_types.slice(0, 4).map((vt) => (
              <span key={vt} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 leading-5">
                🔥 {vt}
              </span>
            ))}
          </div>
        )}

        {/* AI Insight */}
        {insightText && (
          <div className="bg-slate-900 rounded-lg p-2 mb-2 border border-teal-500/20">
            {/* Action label always visible on its own line */}
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3 h-3 text-teal-400 shrink-0" />
              <span className="text-xs font-semibold text-teal-400">AI Investor Brief</span>
              {actionLabel && (
                <span className={`ml-auto text-[11px] shrink-0 ${actionLabel.colorClass}`}>
                  {actionLabel.label}
                </span>
              )}
            </div>
            {/* Brief body collapsed to 1 line */}
            <p className="snap-insight-text text-xs text-slate-400 leading-relaxed line-clamp-1">
              {briefBody}
            </p>
          </div>
        )}

        {/* Contact / CTA */}
        {isUnlocked ? (
          <div className="space-y-1.5">
            {ownerContact && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <Users className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-slate-100 truncate">{formatOwnerName(ownerContact.name)} (Owner)</span>
                </div>
                {ownerContact.phone && (
                  <div className="flex items-center gap-2 text-xs">
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
            <div className="flex gap-2 mt-2">
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
                className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 transition-colors px-2"
              >
                <Heart
                  className={isSaved ? "text-red-500 fill-red-500" : "text-red-400"}
                  size={13}
                />
                <span className="text-xs font-medium text-slate-200">
                  {isSaved ? "Saved" : "Save"}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <Button
              size="sm"
              className="w-full bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); onUnlock?.(property.id); }}
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Unlock Property
            </Button>
            <div className="mt-1.5">
              <ScarcityBadge propertyId={property.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
});
