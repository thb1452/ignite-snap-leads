import { supabase } from "@/integrations/supabase/client";

export interface SkipTraceJob {
  run_id: string;
  user_id: string;
  list_id: string | null;
  total: number;
  queued: number;
  succeeded: number;
  failed: number;
  started_at: string;
  finished_at: string | null;
  settings: any;
}

export async function createBulkSkipTraceJob(propertyIds: string[]) {
  const { data, error } = await supabase.functions.invoke("skiptrace-bulk", {
    body: { property_ids: propertyIds },
  });

  if (error) throw error;
  return data;
}

export async function pollSkipTraceJob(jobId: string): Promise<SkipTraceJob> {
  const { data, error } = await supabase
    .from("skiptrace_bulk_runs")
    .select("*")
    .eq("run_id", jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Job not found");
  return data;
}

export async function getSkipTraceResults(propertyId: string) {
  const { data, error } = await supabase
    .from("property_contacts")
    .select("*")
    .eq("property_id", propertyId);

  if (error) throw error;
  return data ?? [];
}
