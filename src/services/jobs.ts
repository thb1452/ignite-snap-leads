import { supabase } from "@/integrations/supabase/client";

// Map upload_jobs status to Job status
function mapUploadStatus(status: string): 'queued' | 'processing' | 'partial' | 'completed' | 'failed' {
  const statusMap: Record<string, 'queued' | 'processing' | 'partial' | 'completed' | 'failed'> = {
    'QUEUED': 'queued',
    'PARSING': 'processing',
    'PROCESSING': 'processing',
    'DEDUPING': 'processing',
    'FINALIZING': 'processing',
    'COMPLETE': 'completed',
    'FAILED': 'failed',
  };
  return statusMap[status] || 'queued';
}

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
  payload: Record<string, unknown>;
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

interface PropertyRow {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  updated_at: string | null;
}

export async function getJob(jobId: string): Promise<Job> {
  const { data, error } = await supabase
    .from('upload_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) throw error;
  
  // Map upload_jobs to Job interface
  const total = data.total_rows ?? 0;
  const processed = data.processed_rows ?? 0;
  const failed = data.status === 'FAILED' ? (total - processed) : 0;
  
  return {
    id: data.id,
    user_id: data.user_id,
    status: mapUploadStatus(data.status),
    counts: {
      total,
      succeeded: processed,
      failed,
    },
    started_at: data.started_at,
    finished_at: data.finished_at,
    created_at: data.created_at,
    property_ids: [],
    job_key: null,
  };
}

export async function getJobEvents(jobId: string): Promise<JobEvent[]> {
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
  const { page, status: filterStatus } = options;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  // Use any cast to avoid deep type instantiation issues with Supabase generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('properties')
    .select('id, address, city, state, zip, snap_score, updated_at')
    .eq('upload_job_id', jobId)
    .order('snap_score', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;

  const properties = (data ?? []) as PropertyRow[];

  // Get total count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('upload_job_id', jobId);

  // Map properties to results
  const items: JobResult[] = properties.map(prop => ({
    property_id: prop.id,
    address: prop.address,
    city: prop.city,
    state: prop.state,
    zip: prop.zip,
    snap_score: prop.snap_score,
    status: (prop.snap_score ? 'success' : 'no_match') as JobResult['status'],
    phones_found: 0,
    emails_found: 0,
    updated_at: prop.updated_at ?? new Date().toISOString(),
  }));

  // Filter by status if specified
  const filteredItems = filterStatus && filterStatus !== 'all' 
    ? items.filter(item => item.status === filterStatus)
    : items;

  return {
    items: filteredItems,
    total: (count as number) ?? 0,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: properties, error } = await (supabase as any)
    .from('properties')
    .select('id, address, city, state, zip, snap_score')
    .eq('upload_job_id', jobId);

  if (error) throw error;

  const propList = (properties ?? []) as PropertyRow[];

  // Build CSV
  const headers = ['Address', 'City', 'State', 'Zip', 'Snap Score'];
  const rows = propList.map(r => [
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
