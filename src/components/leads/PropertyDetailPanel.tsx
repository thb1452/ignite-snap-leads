import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink, MapPin, Clock, Loader2, X, ArrowLeft, Download, ListPlus, Lock, Unlock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddToListDialog } from "./AddToListDialog";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/externalClient";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatBlurredStreet } from "@/utils/blurredAddress";
import { PropertyMetricsGrid } from "./PropertyMetricsGrid";
import { GroupedViolationsList } from "./GroupedViolationsList";
import { InvestorInsightCard } from "./InvestorInsightCard";
import { exportFilteredCsv } from "@/services/export";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { TrialExportGate } from "@/components/trial/TrialExportGate";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
  // NOTE: description and raw_description are NEVER included for legal safety
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

export function PropertyDetailPanel({ property, open, onOpenChange }: PropertyDetailPanelProps) {
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

  // Use pre-loaded violations if available, otherwise fetch from database
  // This eliminates N+1 queries when violations are already loaded in the parent
  useEffect(() => {
    if (property && open) {
      // Reset state
      setPropertyLists([]);

      // Check if violations are already loaded on the property
      if (property.violations && property.violations.length > 0) {
        console.log(`[PropertyDetailPanel] Using ${property.violations.length} pre-loaded violations for property ${property.id}`);
        setViolations(property.violations);
        setIsLoadingViolations(false);
        return;
      }

      // Fallback: Fetch violations from database only if not pre-loaded
      const fetchViolations = async () => {
        setIsLoadingViolations(true);
        console.log("[PropertyDetailPanel] Fetching violations for property:", property.id);

        try {
          const { data, error } = await supabase
            .from('violations')
            .select('id, violation_type, status, opened_date, days_open, case_id, property_id')
            .eq('property_id', property.id)
            .order('opened_date', { ascending: false });

          if (error) {
            console.error("[PropertyDetailPanel] Error fetching violations:", error);
            setViolations([]);
          } else {
            console.log(`[PropertyDetailPanel] ✓ Fetched ${data?.length || 0} violations for property ${property.id}`);
            setViolations(data || []);
          }
        } catch (err) {
          console.error("[PropertyDetailPanel] Exception fetching violations:", err);
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

  const getScoreClass = useCallback((n: number | null) => {
    if (!n) return 'bg-slate-100 text-ink-600 border border-slate-200';
    if (n >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (n >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-ink-600 border border-slate-200';
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
    property.latitude && property.longitude
      ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`)}`,
    [property.latitude, property.longitude, property.address, property.city, property.state, property.zip]
  );

  const hasMultipleViolations = useMemo(() => violations.length >= 3, [violations.length]);
  const snapScore = property.snap_score;

  // Cache investor brief in database when generated
  const handleBriefGenerated = useCallback(async (brief: InvestorBrief) => {
    try {
      await supabase
        .from('properties')
        .update({ investor_insight_brief: brief as any })
        .eq('id', property.id);
    } catch (err) {
      console.error("[PropertyDetailPanel] Failed to cache brief:", err);
    }
  }, [property.id]);

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
          {/* Hero Header with Close Button */}
          <div className="p-5 md:p-6 border-b bg-white/90 backdrop-blur flex-none">
            {/* Close/Back Button */}
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
            
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl md:text-2xl font-semibold text-ink-900 font-display truncate">
                    {formatAddress(property.address)}
                  </h2>
                  <p className="text-sm text-ink-400 font-ui mt-1">
                    {formatCity(property.city)}, {property.state} {property.zip}
                  </p>
                  {/* Last Snap Update Timestamp */}
                  {property.updated_at && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-ink-400">
                      <Clock className="h-3 w-3" />
                      <span>
                        Last Snap update: {format(new Date(property.updated_at), "MMM d, yyyy")} ({formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })})
                      </span>
                    </div>
                  )}
                </div>
                {snapScore !== null && (
                  <motion.span
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border ${getScoreClass(snapScore)} ${
                      snapScore >= 80 ? 'animate-pulse' : ''
                    }`}
                  >
                    🔥 {snapScore}
                  </motion.span>
                )}
              </div>
            </div>
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 space-y-5 overscroll-contain touch-pan-y">
            {/* Investor Insight AI Brief */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 }}
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
                onBriefGenerated={handleBriefGenerated}
              />
            </motion.div>

            {/* Metrics Grid */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
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

            {/* Map Preview */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <div className="aspect-[16/9] bg-muted relative">
                {property.latitude && property.longitude ? (
                  <iframe
                    title="Property Map"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${property.latitude},${property.longitude}&zoom=17&maptype=satellite`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Map preview unavailable</p>
                    </div>
                  </div>
                )}
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
                  // Trial export gating
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
                  } catch (error: any) {
                    if (error.message === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
                      setTrialGateType('exhausted');
                      setTrialGateOpen(true);
                    } else if (error.message === "TRIAL_EXPIRED") {
                      setTrialGateType('expired');
                      setTrialGateOpen(true);
                    } else {
                      toast({
                        title: "Export Failed",
                        description: error.message || "Failed to export property",
                        variant: "destructive",
                      });
                    }
                  } finally {
                    setIsExporting(false);
                  }
                }}
                className="flex-1 gap-2"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export This
              </Button>
            </div>
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
