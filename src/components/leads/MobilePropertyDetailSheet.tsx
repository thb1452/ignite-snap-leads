import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, MapPin, ExternalLink, Clock, Loader2, ListPlus, Download, Lock, Unlock, Flame, Sparkles, Heart, Users, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/externalClient";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatBlurredStreet } from "@/utils/blurredAddress";
import { formatViolationType } from "@/utils/formatViolationType";
import { PropertyMetricsGrid } from "./PropertyMetricsGrid";
import { GroupedViolationsList } from "./GroupedViolationsList";
import { OwnerContactSection } from "./OwnerContactSection";
import { exportFilteredCsv, getExportErrorToast } from "@/services/export";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { TrialExportGate } from "@/components/trial/TrialExportGate";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
}

interface PropertyWithViolations {
  id: string;
  address: string;
  street_number?: string | null;
  street_name?: string | null;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  violation_types?: string[] | null;
  enforcement_type?: string;
  violations: Violation[];
}

interface MobilePropertyDetailSheetProps {
  property: PropertyWithViolations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToList?: (propertyId: string) => void;
  isUnlocked?: boolean;
  onUnlock?: (propertyId: string) => void;
  isSaved?: boolean;
  onToggleSaved?: (id: string) => void;
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

export function MobilePropertyDetailSheet({
  property,
  open,
  onOpenChange,
  onAddToList,
  isUnlocked = true,
  onUnlock,
  isSaved = false,
  onToggleSaved,
}: MobilePropertyDetailSheetProps) {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [trialGateOpen, setTrialGateOpen] = useState(false);
  const [trialGateType, setTrialGateType] = useState<'exhausted' | 'expired'>('exhausted');
  const { toast } = useToast();
  const {
    isOnTrial,
    hasTrialExpired,
    trialExportsRemaining,
    trialTier,
    trialEndsAt,
    refetch: refetchTrial,
  } = useTrialStatus();

  useEffect(() => {
    if (property && open) {
      if (property.violations && property.violations.length > 0) {
        setViolations(property.violations);
        setIsLoadingViolations(false);
        return;
      }

      const fetchViolations = async () => {
        setIsLoadingViolations(true);
        try {
          const { data, error } = await supabase
            .from('violations')
            .select('id, violation_type, status, opened_date, days_open, case_id, property_id')
            .eq('property_id', property.id)
            .order('opened_date', { ascending: false });

          if (error) {
            setViolations([]);
          } else {
            setViolations(data || []);
          }
        } catch (err) {
          setViolations([]);
        } finally {
          setIsLoadingViolations(false);
        }
      };

      fetchViolations();
    } else {
      setViolations([]);
    }
  }, [property?.id, property?.violations, open]);

  if (!property) return null;

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

  const googleMapsUrl = property.latitude && property.longitude
    ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`)}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="!h-[90dvh] !max-h-[90dvh] rounded-t-3xl !p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="h-full flex flex-col overflow-hidden">
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          {/* Close Button */}
          <button
            type="button"
            aria-label="Close"
            className="absolute top-3 right-3 h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 border shadow-sm"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header */}
          <div className="px-5 pt-2 pb-4 border-b shrink-0">
            {/* 1. Lock/Unlock + SnapScore */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isUnlocked ? (
                  <Unlock className="h-4 w-4 text-teal-500" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={`text-xs font-semibold uppercase tracking-wider ${isUnlocked ? "text-teal-500" : "text-muted-foreground"}`}>
                  {isUnlocked ? "Unlocked" : "Locked"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${getScoreDot(property.snap_score)}`} />
                <span className="text-sm font-bold text-teal-500">SnapScore {property.snap_score || 0}</span>
              </div>
            </div>

            {/* 2. Address */}
            <h2 className="text-xl font-bold text-foreground leading-tight pr-10">
              {isUnlocked
                ? formatAddress(property.address)
                : (
                  <span className="inline-flex items-center gap-2">
                    <span className="blur-[4px] select-none pointer-events-none">####</span>
                    <span>{property.street_name || property.address?.replace(/^\d+\s*/, '')}</span>
                  </span>
                )}
            </h2>
            {/* 3. City, State ZIP */}
            <p className="text-sm text-muted-foreground mt-1">
              {formatCity(property.city)}, {property.state} {property.zip}
            </p>
            {property.updated_at && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Updated {formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })}</span>
              </div>
            )}
          </div>

          {/* Content - Scrollable */}
          <div 
            className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain'
            }}
          >
            {/* 4. Violation tags */}
            {(property.violation_types?.filter(v => v !== 'Unknown').length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {property.enforcement_type === 'water_shutoff' && (
                  <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200 px-2 py-0.5">
                    💧 Water Disconnection
                  </Badge>
                )}
                {property.violation_types?.filter(v => v !== 'Unknown').slice(0, 5).map((vt, i) => (
                  <Badge key={i} variant="outline" className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 border-orange-200 gap-1">
                    <Flame className="h-3 w-3" />
                    {formatViolationType(vt)}
                  </Badge>
                ))}
              </div>
            )}

            {/* 5. AI Investor Brief — dark bg, always visible */}
            {insightText && (
              <div className="bg-slate-900 rounded-lg p-4 border border-teal-500/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-semibold text-teal-400">AI Investor Brief</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {briefBody}{" "}
                  {actionLabel && (
                    <span className={actionLabel.colorClass}>{actionLabel.label}.</span>
                  )}
                </p>
              </div>
            )}

            {/* 6. Owner Contact (unlocked only) */}
            {isUnlocked && (
              <OwnerContactSection propertyId={property.id} isUnlocked={isUnlocked} />
            )}

            {/* Metrics Grid */}
            <PropertyMetricsGrid
              snapScore={property.snap_score}
              openViolations={violations.filter(v => 
                v.status?.toLowerCase().includes('open') || 
                v.status?.toLowerCase() === 'active'
              ).length}
              totalViolations={violations.length}
              oldestDaysOpen={violations.reduce((max, v) => 
                Math.max(max, v.days_open || 0), 0
              ) || null}
            />

            {/* Map Preview - only if coordinates exist */}
            {property.latitude && property.longitude && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="aspect-video bg-muted relative">
                  <iframe
                    title="Property Map"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${property.latitude},${property.longitude}&zoom=17&maptype=satellite`}
                  />
                </div>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 p-3 text-sm text-primary font-medium"
                >
                  <MapPin className="h-4 w-4" />
                  View on Google Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Violations */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  🚨 Violations
                  {violations.length > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({violations.length} total)
                    </span>
                  )}
                </h3>
              </div>
              
              {isLoadingViolations ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <GroupedViolationsList
                  violations={violations}
                  maxInitialGroups={4}
                  onExport={() => {
                    toast({
                      title: "Export Started",
                      description: "Violation data will be included in your export.",
                    });
                  }}
                />
              )}
            </div>
          </div>

          {/* 7. Action Footer — Sticky */}
          <div className="border-t p-4 bg-background pb-[calc(env(safe-area-inset-bottom)+16px)] shrink-0">
            {isUnlocked ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 gap-2 bg-teal-500 hover:bg-teal-600 text-white"
                  disabled={isExporting}
                  onClick={async () => {
                    if (hasTrialExpired) {
                      setTrialGateType('expired');
                      setTrialGateOpen(true);
                      return;
                    }
                    if (isOnTrial && trialExportsRemaining <= 0) {
                      setTrialGateType('exhausted');
                      setTrialGateOpen(true);
                      return;
                    }

                    setIsExporting(true);
                    try {
                      await exportFilteredCsv({
                        propertyIds: [property.id],
                        expectedPropertyCount: 1,
                      });
                      if (isOnTrial) refetchTrial();
                      toast({
                        title: "Export Complete",
                        description: "Property exported successfully.",
                      });
                    } catch (error: unknown) {
                      const msg = error instanceof Error ? error.message : "";
                      if (msg === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
                        setTrialGateType('exhausted');
                        setTrialGateOpen(true);
                      } else if (msg === "TRIAL_EXPIRED") {
                        setTrialGateType('expired');
                        setTrialGateOpen(true);
                      } else {
                        const t = getExportErrorToast(error);
                        toast({ title: t.title, description: t.description, variant: t.variant });
                      }
                    } finally {
                      setIsExporting(false);
                    }
                  }}
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export Lead
                </Button>
                {onToggleSaved && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => onToggleSaved(property.id)}
                  >
                    <Heart className={`h-4 w-4 ${isSaved ? "fill-red-500 text-red-500" : ""}`} />
                    {isSaved ? "Saved" : "Save"}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                size="default"
                onClick={() => onUnlock?.(property.id)}
              >
                <Lock className="h-4 w-4" />
                Unlock Property
              </Button>
            )}
          </div>

          {/* Trial Export Gate */}
          <TrialExportGate
            open={trialGateOpen}
            onOpenChange={setTrialGateOpen}
            type={trialGateType}
            trialTier={trialTier}
            trialEndsAt={trialEndsAt}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}