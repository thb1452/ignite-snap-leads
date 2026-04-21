import { supabase } from "@/integrations/supabase/client";

export interface PipelineStage {
  id: string;
  org_id: string;
  name: string;
  position: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  org_id: string;
  property_id: string;
  owner_id: string | null;
  stage_id: string;
  assigned_to: string | null;
  created_by: string;
  priority: number;
  source: string;
  notes: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  org_id: string;
  actor_id: string | null;
  activity_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

async function getCurrentOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.org_id) throw new Error("No organization found");
  return data.org_id as string;
}

export async function fetchPipelineStages(): Promise<PipelineStage[]> {
  const orgId = await getCurrentOrgId();
  const { data, error } = await supabase
    .from("pipeline_stages" as never)
    .select("*")
    .eq("org_id", orgId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data as unknown as PipelineStage[]) ?? [];
}

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Lead[]) ?? [];
}

export async function fetchLeadById(id: string): Promise<Lead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Lead) ?? null;
}

export async function fetchLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as LeadActivity[]) ?? [];
}

export async function createLeadFromProperty(propertyId: string, source = "manual"): Promise<Lead> {
  const orgId = await getCurrentOrgId();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if lead already exists for this property in this org
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .is("archived_at", null)
    .maybeSingle();
  if (existing) return existing as unknown as Lead;

  // Get first stage (lowest position)
  const stages = await fetchPipelineStages();
  if (stages.length === 0) throw new Error("No pipeline stages configured");
  const firstStage = stages[0];

  const { data, error } = await supabase
    .from("leads")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      stage_id: firstStage.id,
      created_by: user.id,
      assigned_to: user.id,
      source,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Lead;
}

export async function updateLeadStage(leadId: string, stageId: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
}

export async function updateLead(leadId: string, updates: Partial<Lead>): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
}

export async function archiveLead(leadId: string): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
}

export async function addLeadNote(leadId: string, note: string): Promise<void> {
  const orgId = await getCurrentOrgId();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("lead_activities")
    .insert({
      lead_id: leadId,
      org_id: orgId,
      actor_id: user.id,
      activity_type: "note",
      payload: { note },
    });
  if (error) throw error;
}
