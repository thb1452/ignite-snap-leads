import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, MapPin, ExternalLink, Clock, Loader2, MessageSquare, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { getViolationStatusStyle } from "@/utils/violationStatusStyles";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

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
}

export function MobilePropertyDetailSheet({ property, open, onOpenChange }: MobilePropertyDetailSheetProps) {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState(false);
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
        className="h-[95vh] rounded-t-3xl p-0 flex flex-col"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-10 w-10 rounded-full z-10"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b">
          <div className="flex items-start gap-3 pr-10">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-foreground leading-tight">
                {property.address}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {property.city}, {property.state} {property.zip}
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
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Property Image */}
          {property.photo_url ? (
            <div className="aspect-video rounded-xl overflow-hidden bg-muted">
              <img
                src={property.photo_url}
                alt={property.address}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="aspect-video rounded-xl bg-muted flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <div className="text-4xl mb-2">🏠</div>
                <p className="text-sm">No image available</p>
              </div>
            </div>
          )}

          {/* SnapInsight */}
          {property.snap_insight && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <div>
                  <div className="text-xs font-medium text-amber-900 mb-1">SnapInsight</div>
                  <p className="text-sm text-amber-800">{property.snap_insight}</p>
                </div>
              </div>
            </div>
          )}

          {/* Violations */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-foreground">Violations</h3>
              {violations.length > 0 && (
                <span className="text-xs text-muted-foreground">{violations.length} total</span>
              )}
            </div>
            
            {isLoadingViolations ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : violations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No violations recorded
              </p>
            ) : (
              <div className="space-y-3">
                {violations.slice(0, 5).map((v) => {
                  const statusStyle = getViolationStatusStyle(v.status);
                  return (
                    <div key={v.id} className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium text-sm text-foreground">
                          {v.violation_type || "Unknown"}
                        </span>
                        <Badge variant="outline" className={`text-xs ${statusStyle.badge}`}>
                          {v.status || "Unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Opened {formatDate(v.opened_date)} • {v.days_open ?? 0} days open
                      </p>
                    </div>
                  );
                })}
                {violations.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{violations.length - 5} more violations
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Google Maps Link */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary font-medium py-2"
          >
            <MapPin className="h-4 w-4" />
            View on Google Maps
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Action Footer - Sticky */}
        <div className="border-t p-4 bg-background space-y-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <div className="flex gap-3">
            <Button
              className="flex-1 h-12 text-base gap-2"
              onClick={() => {
                toast({
                  title: "Demo Mode",
                  description: "Text message sent to owner",
                });
              }}
            >
              <MessageSquare className="h-5 w-5" />
              Text Owner
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-12 text-base gap-2"
              onClick={() => {
                toast({
                  title: "Demo Mode",
                  description: "Calling owner...",
                });
              }}
            >
              <Phone className="h-5 w-5" />
              Call Owner
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
