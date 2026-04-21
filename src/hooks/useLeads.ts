import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addLeadNote,
  archiveLead,
  createLeadFromProperty,
  fetchLeadActivities,
  fetchLeadById,
  fetchLeads,
  fetchPipelineStages,
  updateLead,
  updateLeadStage,
  type Lead,
} from "@/services/leads";
import { useToast } from "@/hooks/use-toast";

export function usePipelineStages() {
  return useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: fetchPipelineStages,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    staleTime: 30_000,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLeadById(id!),
    enabled: !!id,
  });
}

export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: () => fetchLeadActivities(leadId!),
    enabled: !!leadId,
  });
}

export function useAddToPipeline() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ propertyId, source }: { propertyId: string; source?: string }) =>
      createLeadFromProperty(propertyId, source),
    onSuccess: (lead) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({
        title: "Added to pipeline",
        description: "Property is now in your CRM. Open the lead to start tracking.",
      });
      return lead;
    },
    onError: (err: Error) => {
      toast({
        title: "Could not add to pipeline",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateLeadStage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      updateLeadStage(leadId, stageId),
    onMutate: async ({ leadId, stageId }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const previous = qc.getQueryData<Lead[]>(["leads"]);
      qc.setQueryData<Lead[]>(["leads"], (old) =>
        old?.map((l) => (l.id === leadId ? { ...l, stage_id: stageId } : l)),
      );
      return { previous };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["leads"], ctx.previous);
      toast({ title: "Move failed", description: err.message, variant: "destructive" });
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-activities", vars.leadId] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, updates }: { leadId: string; updates: Partial<Lead> }) =>
      updateLead(leadId, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}

export function useArchiveLead() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: archiveLead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead archived" });
    },
  });
}

export function useAddLeadNote() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ leadId, note }: { leadId: string; note: string }) =>
      addLeadNote(leadId, note),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-activities", vars.leadId] });
      toast({ title: "Note added" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not save note", description: err.message, variant: "destructive" });
    },
  });
}
