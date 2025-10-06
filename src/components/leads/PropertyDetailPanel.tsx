import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ExternalLink, MapPin, AlertTriangle, X, Phone, Mail, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddToListDialog } from "./AddToListDialog";

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
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
  violations: Violation[];
}

interface LeadActivity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

const STATUS_OPTIONS = [
  "Not Called",
  "Called - No Answer",
  "Called - Interested",
  "Called - Not Interested",
  "Deal Made",
] as const;

export function PropertyDetailPanel({ property, open, onOpenChange }: PropertyDetailPanelProps) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [propertyLists, setPropertyLists] = useState<PropertyList[]>([]);
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (property && open) {
      fetchActivities();
      fetchPropertyLists();
    }
  }, [property, open]);

  // Early return AFTER all hooks are declared
  if (!property) return null;

  const fetchActivities = async () => {
    if (!property) return;

    try {
      const { data, error } = await supabase
        .from("lead_activity")
        .select("*")
        .eq("property_id", property.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
      toast({
        title: "Error",
        description: "Failed to load activity history",
        variant: "destructive",
      });
    }
  };

  const fetchPropertyLists = async () => {
    if (!property) return;

    try {
      const { data, error } = await supabase
        .from("list_properties")
        .select(`
          id,
          list_id,
          lead_lists (
            name
          )
        `)
        .eq("property_id", property.id);

      if (error) throw error;

      const formattedLists = (data || []).map((item: any) => ({
        id: item.id,
        list_id: item.list_id,
        list_name: item.lead_lists?.name || "Unknown List",
      }));

      setPropertyLists(formattedLists);
    } catch (error) {
      console.error("Error fetching property lists:", error);
    }
  };

  const handleRemoveFromList = async (listPropertyId: string) => {
    try {
      const { error } = await supabase
        .from("list_properties")
        .delete()
        .eq("id", listPropertyId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Removed from list",
      });

      fetchPropertyLists();
    } catch (error) {
      console.error("Error removing from list:", error);
      toast({
        title: "Error",
        description: "Failed to remove from list",
        variant: "destructive",
      });
    }
  };

  const handleSaveActivity = async () => {
    if (!property || !status) {
      toast({
        title: "Error",
        description: "Please select a status",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from("lead_activity")
        .insert({
          property_id: property.id,
          status,
          notes: notes.trim() || null,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Activity saved successfully",
      });

      setStatus("");
      setNotes("");
      fetchActivities();
    } catch (error) {
      console.error("Error saving activity:", error);
      toast({
        title: "Error",
        description: "Failed to save activity",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getActivityStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Deal Made":
        return "bg-green-600 text-white";
      case "Called - Interested":
        return "bg-primary text-primary-foreground";
      case "Called - Not Interested":
        return "bg-muted text-muted-foreground";
      case "Called - No Answer":
      case "Not Called":
        return "bg-yellow-500 text-white";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const scoreClass = (n: number | null) => {
    if (!n) return 'bg-slate-100 text-ink-600 border border-slate-200';
    if (n >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse';
    if (n >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-ink-600 border border-slate-200';
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
        return "bg-destructive text-destructive-foreground";
      case "pending":
        return "bg-yellow-500 text-white";
      case "closed":
        return "bg-green-600 text-white";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const googleMapsUrl = property.latitude && property.longitude
    ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`)}`;

  const hasMultipleViolations = property.violations.length >= 3;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-hidden p-0 flex flex-col">
        {/* Premium Header */}
        <div className="p-5 border-b bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${scoreClass(property.snap_score)}`}>
              {property.snap_score && property.snap_score >= 80 ? "🔥 " : ""}
              SnapScore {property.snap_score ?? "N/A"}
            </span>
          </div>
          <h2 className="text-xl font-bold text-ink-900 font-display">{property.address}</h2>
          <p className="text-sm text-ink-400 font-ui">{property.city}, {property.state} {property.zip}</p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Property Photo */}
          {property.photo_url ? (
            <img
              src={property.photo_url}
              alt={property.address}
              className="w-full h-72 object-cover rounded-2xl shadow-card"
            />
          ) : (
            <div className="w-full h-72 bg-slate-50 rounded-2xl flex items-center justify-center border">
              <div className="text-center p-4">
                <MapPin className="h-12 w-12 mx-auto text-ink-400 mb-2" />
                <p className="text-sm text-ink-400">{property.address}</p>
              </div>
            </div>
          )}
          
          {hasMultipleViolations && (
            <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900 text-lg">⚠️ MULTIPLE VIOLATIONS</p>
                  <p className="text-sm text-amber-700 mt-1">High likelihood of distressed seller</p>
                </div>
              </div>
            </div>
          )}

          {/* Violations Timeline */}
          <section className="rounded-2xl shadow-card p-4 bg-white">
            <div className="text-sm font-medium mb-3 text-ink-700 font-ui">Violations</div>
            {property.violations.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-4">No violations recorded</p>
            ) : (
              <ol className="relative border-s border-slate-200 ml-3 space-y-4">
                {property.violations.map((v) => (
                  <li key={v.id} className="ms-4">
                    <div className={`absolute -left-1.5 mt-1 h-3 w-3 rounded-full ${
                      v.status === 'Open' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                    <div className={`rounded-xl border p-3 border-l-4 ${
                      v.status === 'Open' ? 'border-l-rose-400' : 'border-l-emerald-400'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-ink-800">{v.violation_type}</div>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          v.status === 'Open'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {v.status}
                        </span>
                      </div>
                      {v.description && (
                        <p className="text-sm text-ink-500 mt-1">{v.description}</p>
                      )}
                      <p className="text-xs text-ink-400 mt-1">
                        Opened {formatDate(v.opened_date)} • {v.days_open} days
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {property.snap_insight && (
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 p-4 border border-blue-200">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-ink-900 mb-2 text-base">SnapScore Insight</h4>
                  <p className="text-sm text-ink-700">{property.snap_insight}</p>
                </div>
              </div>
            </div>
          )}

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

        {/* Sticky Footer CTAs */}
        <div className="border-t p-4 bg-white sticky bottom-0">
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl px-3 py-2 border flex-1">
              <Phone className="h-4 w-4 mr-1" />
              Call
            </Button>
            <Button variant="outline" className="rounded-xl px-3 py-2 border flex-1">
              <MessageSquare className="h-4 w-4 mr-1" />
              SMS
            </Button>
            <Button className="rounded-xl px-3 py-2 bg-ink-900 text-white hover:bg-ink-700 flex-1">
              <Mail className="h-4 w-4 mr-1" />
              Email
            </Button>
          </div>
        </div>

        <AddToListDialog
          open={addToListOpen}
          onOpenChange={setAddToListOpen}
          propertyId={property.id}
          onListAdded={fetchPropertyLists}
          currentListIds={propertyLists.map((l) => l.list_id)}
        />
      </SheetContent>
    </Sheet>
  );
}
