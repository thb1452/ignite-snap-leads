import { supabase } from "@/integrations/supabase/client";

export interface SkipTraceJob {
  id: string;
  user_id: string;
  property_ids: string[];
  vendor: string;
  status: string;
  counts: {
    total: number;
    succeeded: number;
    failed: number;
  };
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  job_key: string | null;
}

export async function createBulkSkipTraceJob(propertyIds: string[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Create deterministic job key for idempotency
  const sortedIds = [...propertyIds].sort();
  const jobKey = `${user.id}:${sortedIds.join(",")}`;

  // Call edge function (handles idempotency internally)
  const { data, error } = await supabase.functions.invoke("skiptrace-bulk", {
    body: { 
      property_ids: propertyIds,
      job_key: jobKey,
    },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Failed to create job");
  return data;
}

export async function pollSkipTraceJob(jobId: string): Promise<SkipTraceJob> {
  const { data, error } = await supabase
    .from("skiptrace_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Job not found");
  
  // Parse counts from jsonb
  const counts = (data.counts as any) || { total: 0, succeeded: 0, failed: 0 };
  
  return {
    ...data,
    counts,
  } as SkipTraceJob;
}

export async function getSkipTraceResults(propertyId: string) {
  const { data, error } = await supabase
    .from("property_contacts")
    .select("*")
    .eq("property_id", propertyId);

  if (error) throw error;
  return data ?? [];
}

export async function checkConsent(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("user_profiles")
    .select("consented_skiptrace")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.consented_skiptrace ?? false;
}

export async function setConsent() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("user_profiles")
    .update({ consented_skiptrace: true })
    .eq("user_id", user.id);

  if (error) throw error;
}
