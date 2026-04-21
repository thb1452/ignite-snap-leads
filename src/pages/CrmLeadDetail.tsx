import { useParams, Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useLead,
  usePipelineStages,
  useUpdateLeadStage,
  useArchiveLead,
} from "@/hooks/useLeads";
import { LeadActivityTimeline } from "@/components/crm/LeadActivityTimeline";
import { DistressTimeline } from "@/components/crm/DistressTimeline";
import { ArrowLeft, Archive, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";

function usePropertySnapshot(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["lead-property-snapshot", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, city, state, zip, snap_score, snap_insight")
        .eq("id", propertyId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        address: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        snap_score: number | null;
        snap_insight: string | null;
      } | null;
    },
    enabled: !!propertyId,
  });
}

export default function CrmLeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: lead, isLoading: leadLoading } = useLead(id);
  const { data: stages } = usePipelineStages();
  const { data: property, isLoading: propLoading } = usePropertySnapshot(lead?.property_id);
  const { mutate: moveStage } = useUpdateLeadStage();
  const { mutate: archive, isPending: archiving } = useArchiveLead();

  const currentStage = stages?.find((s) => s.id === lead?.stage_id);

  return (
    <AppLayout>
      <SEOHead title="Lead Detail | Snap Ignite CRM" description="View and manage a CRM lead." canonical="/crm/leads" />
      <div className="px-4 md:px-6 py-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/crm/pipeline">
              <ArrowLeft className="h-4 w-4" />
              Back to Pipeline
            </Link>
          </Button>
          {lead && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => archive(lead.id)}
              disabled={archiving}
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
        </div>

        {leadLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !lead ? (
          <Card className="p-8 text-center text-muted-foreground">Lead not found.</Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="text-xl">
                        {propLoading
                          ? "Loading property…"
                          : property?.address ?? "Unknown property"}
                      </CardTitle>
                      {property && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {property.city}, {property.state} {property.zip ?? ""}
                        </p>
                      )}
                    </div>
                    {property?.snap_score != null && (
                      <Badge variant="secondary" className="text-base px-3 py-1">
                        SnapScore {property.snap_score}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {property?.snap_insight && (
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                        AI Brief
                      </p>
                      <p className="text-sm leading-relaxed">{property.snap_insight}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Source</p>
                      <p className="font-medium">{lead.source}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {property && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/properties?focus=${property.id}`}>
                        <ExternalLink className="h-4 w-4" />
                        View full property
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>

              <DistressTimeline propertyId={lead.property_id} />

              <LeadActivityTimeline leadId={lead.id} />
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Stage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select
                    value={lead.stage_id}
                    onValueChange={(stageId) => moveStage({ leadId: lead.id, stageId })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            {s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {currentStage && (
                    <p className="text-xs text-muted-foreground">
                      Currently in <strong>{currentStage.name}</strong>
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Owner Contact</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Owner contact will appear here once skip-trace is enriched.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
