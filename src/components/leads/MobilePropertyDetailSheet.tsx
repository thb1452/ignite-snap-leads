import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, MapPin, ExternalLink, Clock, Loader2, ListPlus, Download, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { PropertyMetricsGrid } from "./PropertyMetricsGrid";
import { GroupedViolationsList } from "./GroupedViolationsList";
import { exportFilteredCsv } from "@/services/export";

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

interface MobilePropertyDetailSheetProps {
  property: PropertyWithViolations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToList?: (propertyId: string) => void;
}

export function MobilePropertyDetailSheet({ property, open, onOpenChange, onAddToList }: MobilePropertyDetailSheetProps) {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  // Fetch violations when property changes
  useEffect(() => {
    if (property && open) {
      const fetchViolations = async () => {
        setIsLoadingViolations(true);
        try {
          const { data, error } = await supabase
            .from('violations')
            .select('id, violation_type, status, opened_date, days_open, case_id')
            .eq('property_id', property.id)
            .order('opened_date', { ascending: false });

          if (!error) {
            setViolations(data || []);
          }
        } catch (err) {
          console.error("Error fetching violations:", err);
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

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 75) return "bg-red-500 text-white";
    if (score >= 50) return "bg-orange-500 text-white";
    if (score >= 25) return "bg-yellow-500 text-black";
    return "bg-blue-500 text-white";
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM d, yyyy");
  };

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

          {/* Close Button - positioned absolutely */}
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
            <div className="flex items-start gap-3 pr-10">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-foreground leading-tight">
                  {formatAddress(property.address)}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatCity(property.city)}, {property.state} {property.zip}
                </p>
                {property.updated_at && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>
                      Updated {formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                )}
              </div>
              <Badge className={`${getScoreColor(property.snap_score)} text-base font-bold px-3 py-1.5 shrink-0`}>
                {property.snap_score || 0}
              </Badge>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div 
            className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain'
            }}
          >
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

            {/* SnapInsight */}
            {property.snap_insight && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <div className="text-xs font-medium text-amber-900 mb-1">SnapInsight</div>
                    <p className="text-sm text-amber-800 leading-relaxed">{property.snap_insight}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Map Preview */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="aspect-video bg-muted relative">
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
                className="flex items-center justify-center gap-2 p-3 text-sm text-primary font-medium"
              >
                <MapPin className="h-4 w-4" />
                View on Google Maps
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

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

          {/* Action Footer - Sticky */}
          <div className="border-t p-4 bg-background pb-[calc(env(safe-area-inset-bottom)+16px)] shrink-0">
            <div className="flex items-center gap-2">
              {onAddToList && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => {
                    onAddToList(property.id);
                    onOpenChange(false);
                  }}
                >
                  <ListPlus className="h-4 w-4" />
                  Add to List
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="flex-1 gap-2"
                disabled={isExporting}
                onClick={async () => {
                  setIsExporting(true);
                  try {
                    await exportFilteredCsv({
                      propertyIds: [property.id],
                      expectedPropertyCount: 1,
                    });
                    toast({
                      title: "Export Complete",
                      description: "Property exported successfully.",
                    });
                  } catch (error: any) {
                    toast({
                      title: "Export Failed",
                      description: error.message || "Failed to export property",
                      variant: "destructive",
                    });
                  } finally {
                    setIsExporting(false);
                  }
                }}
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  toast({
                    title: "Find Similar",
                    description: "Coming soon: Find properties with similar violation profiles.",
                  });
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}