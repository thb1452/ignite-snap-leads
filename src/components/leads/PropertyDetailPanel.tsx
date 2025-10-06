import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ExternalLink, MapPin, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  if (!property) return null;

  useEffect(() => {
    if (property && open) {
      fetchActivities();
    }
  }, [property, open]);

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

  const getScoreBadgeVariant = (score: number | null) => {
    if (!score) return "secondary";
    if (score >= 80) return "score-high";
    if (score >= 50) return "score-medium";
    return "score-low";
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
      <SheetContent className="w-full sm:max-w-[500px] overflow-y-auto">
        <SheetHeader className="space-y-4 pb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <Badge
                variant={getScoreBadgeVariant(property.snap_score)}
                className="text-lg px-4 py-1.5 mb-3"
              >
                {property.snap_score && property.snap_score >= 80 ? "🔥 " : ""}
                SnapScore: {property.snap_score ?? "N/A"}
              </Badge>
              <SheetTitle className="text-2xl font-bold text-foreground">
                {property.address}
              </SheetTitle>
              <p className="text-muted-foreground mt-1">
                {property.city}, {property.state} {property.zip}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 pb-6">
          {/* Property Photo */}
          <div className="space-y-2">
            {property.photo_url ? (
              <img
                src={property.photo_url}
                alt={property.address}
                className="w-full h-48 object-cover rounded-lg border"
              />
            ) : (
              <div className="w-full h-48 bg-muted rounded-lg border flex items-center justify-center">
                <div className="text-center p-4">
                  <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{property.address}</p>
                </div>
              </div>
            )}
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <MapPin className="h-4 w-4" />
              View on Google Maps
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <Separator />

          {/* Multiple Violations Warning */}
          {hasMultipleViolations && (
            <Card className="border-destructive bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">
                    ⚠️ MULTIPLE VIOLATIONS
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    High likelihood of distressed seller
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Violations List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Violations</h3>
              <Badge variant="secondary">{property.violations.length}</Badge>
            </div>

            {property.violations.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-muted-foreground">No violations recorded</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {property.violations.map((violation) => (
                  <Card key={violation.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-foreground flex-1">
                        {violation.violation_type}
                      </h4>
                      <Badge className={getStatusBadgeClass(violation.status)}>
                        {violation.status}
                      </Badge>
                    </div>

                    {violation.description && (
                      <p className="text-sm text-muted-foreground">
                        {violation.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                      <div>
                        <span className="font-medium">Opened:</span>{" "}
                        {formatDate(violation.opened_date)}
                      </div>
                      {violation.days_open !== null && (
                        <Badge variant="outline" className="text-xs">
                          {violation.days_open} days open
                        </Badge>
                      )}
                    </div>

                    {violation.case_id && (
                      <p className="text-xs text-muted-foreground">
                        Case ID: {violation.case_id}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* SnapScore Insight */}
          {property.snap_insight && (
            <>
              <Card className="bg-primary/5 border-primary/20 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">💡</span>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-2">
                      SnapScore Insight
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {property.snap_insight}
                    </p>
                  </div>
                </div>
              </Card>
              <Separator />
            </>
          )}

          {/* Property Details Placeholder */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Property Details</h3>
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Additional property details coming soon
              </p>
            </Card>
          </div>

          <Separator />

          {/* Activity Tracking */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">My Activity</h3>

            {/* Activity Form */}
            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Add notes about this lead..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleSaveActivity}
                disabled={loading || !status}
                className="w-full"
              >
                {loading ? "Saving..." : "Save Activity"}
              </Button>
            </Card>

            {/* Activity History */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Activity History
              </h4>
              {activities.length === 0 ? (
                <Card className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    No activity recorded yet
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {activities.map((activity) => (
                    <Card key={activity.id} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Badge className={getActivityStatusBadgeClass(activity.status)}>
                          {activity.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(activity.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {activity.notes && (
                        <p className="text-sm text-muted-foreground">
                          {activity.notes}
                        </p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Actions</h3>
            <div className="space-y-2">
              <Button className="w-full" size="lg">
                Run Skip Trace
              </Button>
              <Button variant="outline" className="w-full" size="lg">
                Add to List
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
