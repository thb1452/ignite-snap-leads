import { supabase } from "@/integrations/supabase/client";

export interface Job {
  id: string;
  user_id: string;
  status: 'queued' | 'processing' | 'partial' | 'completed' | 'failed';
  counts: {
    total: number;
    succeeded: number;
    failed: number;
  };
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  property_ids: string[];
  job_key: string | null;
}

export interface JobEvent {
  type: string;
  timestamp: string;
  payload: any;
}

export interface JobResult {
  property_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  status: 'success' | 'no_match' | 'vendor_error' | 'timeout';
  phones_found: number;
  emails_found: number;
  updated_at: string;
}

export async function getJob(jobId: string): Promise<Job> {
  const { data, error } = await supabase
    .from('upload_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) throw error;
  
  // Map upload_jobs to Job interface
  return {
    id: data.id,
    user_id: data.user_id,
    status: data.status as Job['status'],
    counts: {
      total: data.total_rows ?? 0,
      succeeded: data.processed_rows ?? 0,
      failed: data.failed_rows ?? 0,
    },
    started_at: data.started_at,
    finished_at: data.finished_at,
    created_at: data.created_at,
    property_ids: [],
    job_key: null,
  };
}

export async function getJobEvents(jobId: string): Promise<JobEvent[]> {
  // Construct events from job data
  const job = await getJob(jobId);
  
  const events: JobEvent[] = [];
  
  if (job.created_at) {
    events.push({
      type: 'job_queued',
      timestamp: job.created_at,
      payload: { job_id: job.id, total: job.counts.total }
    });
  }
  
  if (job.started_at) {
    events.push({
      type: 'job_started',
      timestamp: job.started_at,
      payload: { job_id: job.id, total: job.counts.total }
    });
  }
  
  if (job.finished_at) {
    const failed = job.counts.failed;
    if (failed > 0) {
      events.push({
        type: 'job_failed_rows',
        timestamp: job.finished_at,
        payload: { job_id: job.id, count: failed }
      });
    }
    
    events.push({
      type: 'job_done',
      timestamp: job.finished_at,
      payload: { 
        job_id: job.id, 
        status: job.status,
        succeeded: job.counts.succeeded,
        failed: job.counts.failed 
      }
    });
  }
  
  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export async function getJobResults(
  jobId: string, 
  options: { page: number; status?: string }
): Promise<{ items: JobResult[]; total: number }> {
  const { page, status } = options;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  // Get properties from this upload job
  const { data: properties, error } = await supabase
    .from('properties')
    .select(`
      id,
      address,
      city,
      state,
      zip,
      snap_score,
      updated_at
    `)
    .eq('upload_job_id', jobId)
    .order('snap_score', { ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;

  // Get total count
  const { count } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('upload_job_id', jobId);

  // Map properties to results
  const items: JobResult[] = (properties ?? []).map(prop => ({
    property_id: prop.id,
    address: prop.address,
    city: prop.city,
    state: prop.state,
    zip: prop.zip,
    snap_score: prop.snap_score,
    status: prop.snap_score ? 'success' : 'no_match',
    phones_found: 0,
    emails_found: 0,
    updated_at: prop.updated_at ?? new Date().toISOString(),
  }));

  // Filter by status if specified
  const filteredItems = status && status !== 'all' 
    ? items.filter(item => item.status === status)
    : items;

  return {
    items: filteredItems,
    total: count ?? 0,
  };
}

export async function getJobLedger(jobId: string) {
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('*')
    .eq('meta->>job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function exportJobCSV(jobId: string) {
  // Get all properties from this job
  const { data: properties, error } = await supabase
    .from('properties')
    .select(`
      id,
      address,
      city,
      state,
      zip,
      snap_score
    `)
    .eq('upload_job_id', jobId);

  if (error) throw error;

  // Build CSV
  const headers = ['Address', 'City', 'State', 'Zip', 'Snap Score'];
  const rows = (properties ?? []).map(r => [
    r.address,
    r.city,
    r.state,
    r.zip,
    r.snap_score || '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  
  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `job-${jobId.slice(0, 8)}-results.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
