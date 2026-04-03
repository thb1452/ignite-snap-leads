import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink, MapPin, Clock, Loader2, X, ArrowLeft, Download, ListPlus, Lock, Unlock, Heart, Users, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddToListDialog } from "./AddToListDialog";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/externalClient";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatBlurredStreet } from "@/utils/blurredAddress";
import { PropertyMetricsGrid } from "./PropertyMetricsGrid";
import { GroupedViolationsList } from "./GroupedViolationsList";
import { InvestorInsightCard } from "./InvestorInsightCard";
import { exportFilteredCsv, getExportErrorToast } from "@/services/export";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { TrialExportGate } from "@/components/trial/TrialExportGate";
import { OwnerContactSection } from "./OwnerContactSection";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
}

interface InvestorBrief {
  brief_text: string;
  enforcement_summary?: string;
  distress_indicators?: string;
  recommended_action?: string;
  generated_at: string;
  property_snap_score: number | null;
  newest_violation_date?: string | null;
}

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  opportunity_class?: string | null;
  open_violations?: number | null;
  distress_signals?: string[] | null;
  newest_violation_date?: string | null;
  investor_insight_brief?: InvestorBrief | null;
  violations: Violation[];
}

interface PropertyList {
  id: string;
  list_id: string;
  list_name: string;
}

interface PropertyDetailPanelProps {
  property: PropertyWithViolations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isUnlocked?: boolean;
  onUnlock?: (propertyId: string) => void;
}

export function PropertyDetailPanel({ property, open, onOpenChange, isUnlocked = true, onUnlock }: PropertyDetailPanelProps) {
  const [propertyLists, setPropertyLists] = useState<PropertyList[]>([]);
  const [addToListOpen, setAddToListOpen] = useState(false);
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
      setPropertyLists([]);

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

  const getScoreColor = useCallback((score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 75) return "bg-red-500 text-white";
    if (score >= 50) return "bg-orange-500 text-white";
    if (score >= 25) return "bg-yellow-500 text-black";
    return "bg-green-500 text-white";
  }, []);

  const getScoreDot = useCallback((score: number | null) => {
    if (!score) return "bg-muted-foreground";
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-500";
    if (score >= 25) return "bg-yellow-500";
    return "bg-green-500";
  }, []);

  const formatDate = useCallback((dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const googleMapsUrl = useMemo(() =>
    property
      ? (property.latitude && property.longitude
          ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`)}`)
      : "",
    [property?.latitude, property?.longitude, property?.address, property?.city, property?.state, property?.zip]
  );

  const snapScore = property?.snap_score ?? null;

  // Brief is display-only — no on-demand generation

  if (!property) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] h-[100dvh] max-h-[100dvh] p-0 flex flex-col z-[2000] snap-drawer [&>button]:hidden">
        <motion.div
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          className="h-full flex flex-col min-h-0"
        >
          {/* Hero Header */}
          <div className="p-5 md:p-6 border-b bg-white/90 backdrop-blur flex-none">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                aria-label="Close property details"
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors -ml-1 py-1"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to leads</span>
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lock status + SnapScore */}
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
                <div className={`w-2.5 h-2.5 rounded-full ${getScoreDot(snapScore)}`} />
                <span className="text-sm font-bold text-teal-500">SnapScore {snapScore || 0}</span>
              </div>
            </div>

            {/* Address */}
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {isUnlocked
                  ? formatAddress(property.address)
                  : (
                    <span className="inline-flex items-center gap-2">
                      <span className="blur-[4px] select-none pointer-events-none">####</span>
                      <span>{property.address?.replace(/^\d+\s*/, '')}</span>
                    </span>
                  )}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {formatCity(property.city)}, {property.state} {property.zip}
              </p>
              {property.updated_at && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    Last update: {format(new Date(property.updated_at), "MMM d, yyyy")} ({formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })})
                  </span>
                </div>
              )}
            </div>

            {/* Unlock CTA for locked properties */}
            {!isUnlocked && onUnlock && (
              <div className="mt-3">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnlock(property.id);
                  }}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  size="default"
                >
                  <Lock className="h-4 w-4" />
                  Unlock Property
                </Button>
              </div>
            )}
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 space-y-5 overscroll-contain touch-pan-y">
            {/* Metrics Grid */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 }}
            >
              <PropertyMetricsGrid
                snapScore={snapScore}
                openViolations={violations.filter(v =>
                  v.status?.toLowerCase().includes('open') ||
                  v.status?.toLowerCase() === 'active'
                ).length}
                totalViolations={violations.length}
                oldestDaysOpen={violations.reduce((max, v) =>
                  Math.max(max, v.days_open || 0), 0
                ) || null}
              />
            </motion.div>

            {/* Investor Insight AI Brief - always visible, never collapsible */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
            >
              <InvestorInsightCard
                propertyId={property.id}
                snapScore={snapScore}
                snapInsight={property.snap_insight}
                opportunityClass={property.opportunity_class ?? null}
                openViolations={property.open_violations ?? null}
                distressSignals={property.distress_signals ?? null}
                newestViolationDate={property.newest_violation_date ?? null}
                cachedBrief={property.investor_insight_brief ?? null}
              />
            </motion.div>

            {/* Owner Contact Info (unlocked only) */}
            {isUnlocked && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                <OwnerContactSection propertyId={property.id} isUnlocked={isUnlocked} />
              </motion.div>
            )}

            {/* Map Preview - hide if unavailable */}
            {property.latitude && property.longitude && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="rounded-xl border bg-card overflow-hidden"
              >
                <div className="aspect-[16/9] bg-muted relative">
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
                  className="flex items-center justify-center gap-2 p-3 text-sm text-primary font-medium hover:bg-muted/50 transition-colors"
                >
                  <MapPin className="h-4 w-4" />
                  View on Google Maps
                  <ExternalLink className="h-3 w-3" />
                </a>
              </motion.div>
            )}

            {/* Violations Section */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl border bg-card p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  🚨 Violations
                  <span className="text-sm font-normal text-muted-foreground">
                    ({violations.length} total)
                  </span>
                </h3>
              </div>

              {isLoadingViolations ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading violations...</span>
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
            </motion.section>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t p-4 md:p-5 bg-background sticky bottom-0 pb-[calc(env(safe-area-inset-bottom)+16px)] flex-shrink-0">
            {isUnlocked ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddToListOpen(true)}
                  className="flex-1 gap-2"
                >
                  <ListPlus className="h-4 w-4" />
                  Add to List
                </Button>
                <Button
                  variant="default"
                  size="sm"
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
                  className="flex-1 gap-2 bg-teal-500 hover:bg-teal-600 text-white"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Export Lead
                </Button>
              </div>
            ) : (
              <Button
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                size="default"
                onClick={() => onUnlock?.(property.id)}
              >
                <Lock className="h-4 w-4" />
                Unlock for $0.67
              </Button>
            )}
          </div>
        </motion.div>

        <TrialExportGate
          open={trialGateOpen}
          onOpenChange={setTrialGateOpen}
          type={trialGateType}
          trialTier={trialTier}
          trialEndsAt={trialEndsAt}
        />

        <AddToListDialog
          open={addToListOpen}
          onOpenChange={setAddToListOpen}
          propertyIds={[property.id]}
          onSuccess={() => setAddToListOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
