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
    .from('skiptrace_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) throw error;
  return data as unknown as Job;
}

export async function getJobEvents(jobId: string): Promise<JobEvent[]> {
  // For now, we'll construct events from the job data
  // Later, this can pull from an events table if we implement one
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
    const refunded = job.counts.failed;
    if (refunded > 0) {
      events.push({
        type: 'job_refunded',
        timestamp: job.finished_at,
        payload: { job_id: job.id, count: refunded }
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

  // Get the job to access property_ids
  const { data: job } = await supabase
    .from('skiptrace_jobs')
    .select('property_ids')
    .eq('id', jobId)
    .single();

  if (!job || !job.property_ids) {
    return { items: [], total: 0 };
  }

  // Fetch properties and their contacts
  let query = supabase
    .from('properties')
    .select(`
      id,
      address,
      city,
      state,
      zip,
      snap_score
    `)
    .in('id', job.property_ids)
    .order('snap_score', { ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  const { data: properties, error } = await query;
  
  if (error) throw error;

  // Fetch contacts for these properties
  const propertyIds = properties?.map(p => p.id) ?? [];
  const { data: contacts } = await supabase
    .from('property_contacts')
    .select('property_id, phone, email')
    .in('property_id', propertyIds);

  // Group contacts by property
  const contactsByProperty = (contacts ?? []).reduce((acc, contact) => {
    if (!acc[contact.property_id]) {
      acc[contact.property_id] = { phones: 0, emails: 0 };
    }
    if (contact.phone) acc[contact.property_id].phones++;
    if (contact.email) acc[contact.property_id].emails++;
    return acc;
  }, {} as Record<string, { phones: number; emails: number }>);

  // Map properties to results
  const items: JobResult[] = (properties ?? []).map(prop => {
    const contactStats = contactsByProperty[prop.id] || { phones: 0, emails: 0 };
    const hasContacts = contactStats.phones > 0 || contactStats.emails > 0;
    
    let resultStatus: JobResult['status'] = 'no_match';
    if (hasContacts) {
      resultStatus = 'success';
    }

    return {
      property_id: prop.id,
      address: prop.address,
      city: prop.city,
      state: prop.state,
      zip: prop.zip,
      snap_score: prop.snap_score,
      status: resultStatus,
      phones_found: contactStats.phones,
      emails_found: contactStats.emails,
      updated_at: new Date().toISOString(),
    };
  });

  // Filter by status if specified
  const filteredItems = status && status !== 'all' 
    ? items.filter(item => item.status === status)
    : items;

  return {
    items: filteredItems,
    total: job.property_ids.length,
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
