import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeads, usePipelineStages, useUpdateLeadStage } from "@/hooks/useLeads";
import { Briefcase, GripVertical } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function CrmPipeline() {
  const { data: stages, isLoading: stagesLoading } = usePipelineStages();
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { mutate: moveStage } = useUpdateLeadStage();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const leadsByStage = useMemo(() => {
    const map: Record<string, typeof leads> = {};
    (stages ?? []).forEach((s) => (map[s.id] = []));
    (leads ?? []).forEach((l) => {
      if (!map[l.stage_id]) map[l.stage_id] = [];
      map[l.stage_id]!.push(l);
    });
    return map;
  }, [leads, stages]);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggingId(leadId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", leadId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(stageId);
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setDragOverStage(null);
    const lead = leads?.find((l) => l.id === leadId);
    if (lead && lead.stage_id !== stageId) {
      moveStage({ leadId, stageId });
    }
  };

  const isLoading = stagesLoading || leadsLoading;

  return (
    <AppLayout>
      <SEOHead title="Pipeline | Snap Ignite CRM" description="Track distress-rich leads through your pipeline." />
      <PageHeader
        title="Pipeline"
        description="Drag leads between stages. Every move is tracked."
      />

      <div className="px-4 md:px-6 pb-8">
        {isLoading ? (
          <div className="flex gap-4 overflow-x-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[400px] w-[280px] flex-shrink-0" />
            ))}
          </div>
        ) : !stages || stages.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No pipeline stages found. Contact support to set up your pipeline.
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const stageLeads = leadsByStage[stage.id] ?? [];
              const isDropTarget = dragOverStage === stage.id;
              return (
                <div
                  key={stage.id}
                  className="flex-shrink-0 w-[280px]"
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <h3 className="font-medium text-sm">{stage.name}</h3>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {stageLeads.length}
                    </Badge>
                  </div>
                  <div
                    className={`min-h-[400px] rounded-lg p-2 space-y-2 transition-colors ${
                      isDropTarget ? "bg-accent" : "bg-muted/30"
                    }`}
                  >
                    {stageLeads.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        Drop leads here
                      </p>
                    ) : (
                      stageLeads.map((lead) => (
                        <Link
                          key={lead.id}
                          to={`/crm/leads/${lead.id}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          className={`block ${draggingId === lead.id ? "opacity-50" : ""}`}
                        >
                          <Card className="p-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                            <div className="flex items-start gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                  Lead · {lead.id.slice(0, 8)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {lead.source}
                                </p>
                                {lead.notes && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {lead.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Card>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
