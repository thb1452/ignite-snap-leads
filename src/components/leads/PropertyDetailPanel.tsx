import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink, MapPin, Clock, Loader2, X, ArrowLeft, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddToListDialog } from "./AddToListDialog";
import { formatDistanceToNow, format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { getViolationStatusStyle } from "@/utils/violationStatusStyles";
import { supabase } from "@/integrations/supabase/client";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
  // NOTE: description and raw_description are NEVER included for legal safety
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
}

export function PropertyDetailPanel({ property, open, onOpenChange }: PropertyDetailPanelProps) {
  const [propertyLists, setPropertyLists] = useState<PropertyList[]>([]);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState(false);
  const { toast } = useToast();

  // Fetch violations when property changes
  useEffect(() => {
    if (property && open) {
      // Reset state
      setPropertyLists([]);

      // Fetch violations from database
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
            console.error("[PropertyDetailPanel] Error details:", {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
            setViolations([]);
          } else {
            console.log(`[PropertyDetailPanel] ✓ Fetched ${data?.length || 0} violations for property ${property.id}`);
            if (data && data.length > 0) {
              console.log("[PropertyDetailPanel] Sample violation:", data[0]);
            }
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
  }, [property?.id, open]);

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
          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 space-y-6 overscroll-contain touch-pan-y">
            {/* Property Image */}
            {property.photo_url ? (
              <div className="aspect-[16/9] rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={property.photo_url}
                  alt={property.address}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="aspect-[16/9] rounded-xl bg-slate-100 flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <div className="text-4xl mb-2">🏠</div>
                  <p className="text-sm">No image available</p>
                </div>
              </div>
            )}

            {/* SnapInsight Card */}
            {property.snap_insight && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-amber-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-amber-50/50 p-4"
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <div className="text-xs font-medium text-amber-900 mb-1">SnapInsight</div>
                    <p className="text-sm text-amber-800">{property.snap_insight}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Tags Section (Demo Mode) */}
            {(property as any).mockTags && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="flex flex-wrap gap-2"
              >
                {(property as any).mockTags.map((tag: string, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {tag}
                  </span>
                ))}
              </motion.div>
            )}

            {/* Violations Timeline */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl border border-slate-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-white p-5 md:p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-ink-700 font-ui">Violations</div>
                {violations.length > 0 && (
                  <span className="text-xs text-ink-400">{violations.length} total</span>
                )}
              </div>
              {isLoadingViolations ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
                  <span className="ml-2 text-sm text-ink-400">Loading violations...</span>
                </div>
              ) : violations.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-ink-500 mb-1">
                    {snapScore ? "No violation records found" : "No violations recorded"}
                  </p>
                  <p className="text-xs text-ink-400">
                    {snapScore
                      ? "This property has a SnapScore but detailed violation records are not available in the database."
                      : "Check the browser console for any errors."}
                  </p>
                </div>
              ) : (
                <ol className="relative border-s border-slate-200 ml-3 space-y-4">
                  {violations.map((v) => {
                    const statusStyle = getViolationStatusStyle(v.status);
                    const statusBadge = (
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusStyle.badge}`}>
                        {v.status || "Unknown"}
                      </span>
                    );

                    return (
                      <li key={v.id} className="ms-4">
                        <div className={`absolute -left-1.5 mt-1 h-3 w-3 rounded-full ${statusStyle.dot}`} />
                        <div className="rounded-xl border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-ink-800 text-sm">{formatViolationType(v.violation_type)}</div>
                            {statusStyle.tooltip ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {statusBadge}
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs max-w-[200px]">{statusStyle.tooltip}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : statusBadge}
                          </div>
                          {/* NOTE: Raw violation descriptions are NEVER shown to users for legal safety */}
                          {v.case_id && (
                            <p className="text-xs text-ink-400 mt-1">Case: {v.case_id}</p>
                          )}
                          <p className="text-xs text-ink-400 mt-1">
                            Opened {formatDate(v.opened_date)} • {v.days_open ?? 0} days open
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </motion.section>



            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-brand hover:underline font-medium"
            >
              <MapPin className="h-4 w-4" />
              View on Google Maps
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t p-4 md:p-5 bg-white sticky bottom-0 space-y-3 pb-[calc(env(safe-area-inset-bottom)+16px)] flex-shrink-0">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setAddToListOpen(true)}
                className="flex-1"
              >
                Add to List
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  toast({
                    title: "Export Started",
                    description: "Property data will be included in your next export.",
                  });
                }}
                className="flex-1 gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </motion.div>

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
