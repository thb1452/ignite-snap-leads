import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type RequestJob = Pick<Row<'foia_request_jobs'>, 'id' | 'request_type' | 'status' | 'jurisdiction' | 'state' | 'updated_at' | 'sent_at' | 'response_due_at' | 'retry_count'>;
export type AgentRun = Pick<Row<'agent_runs'>, 'id' | 'agent_name' | 'status' | 'created_at' | 'cost_usd' | 'duration_ms'>;
export type Outlet = Pick<Row<'press_accounts'>, 'id' | 'name' | 'domain' | 'email' | 'is_active'>;
export type Upload = Pick<Row<'upload_jobs'>, 'id' | 'filename' | 'status' | 'created_at' | 'finished_at' | 'processed_rows' | 'bad_addresses' | 'source_type'>;
export type Review = Omit<Database['public']['Views']['v_needs_human_review_queue']['Row'], 'error_message'>;
export type Feed<T> = { data: T | null; error: string | null; checkedAt: string; total?: number };
export type Snapshot = {
  requests: Feed<RequestJob[]>; agents: Feed<AgentRun[]>; outlets: Feed<Outlet[]>;
  uploads: Feed<Upload[]>; reviews: Feed<Review[]>;
  sentToday: Feed<number>; repliesToday: Feed<number>;
  windowStart: string; windowEnd: string;
};

export async function verifyOwner(userId: string): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error('Your session could not be verified. Sign in again.');
  if (!data.user || data.user.id !== userId) return false;
  // Verify the database role. Cached client roles and paid subscriptions are not authority.
  const result = await supabase.rpc('has_role', { _user_id: data.user.id, _role: 'admin' })
    .abortSignal(AbortSignal.timeout(15000));
  if (result.error) throw new Error('Owner access could not be verified. Try again.');
  return result.data === true;
}

type Result<T> = { data: T | null; error: { message: string } | null; count?: number | null };
async function feed<T>(request: PromiseLike<Result<T>>): Promise<Feed<T>> {
  try {
    const r = await request;
    if (r.error) throw new Error(r.error.message);
    if (r.data === null) throw new Error('No data returned');
    return { data: r.data, error: null, checkedAt: new Date().toISOString(), ...(r.count == null ? {} : { total: r.count }) };
  } catch {
    return { data: null, error: 'This feed is unavailable. Check its connection and permissions, then refresh.', checkedAt: new Date().toISOString() };
  }
}
async function countFeed(request: PromiseLike<Result<unknown>>): Promise<Feed<number>> {
  try {
    const r = await request;
    if (r.error || r.count == null) throw new Error('Count unavailable');
    return { data: r.count, error: null, checkedAt: new Date().toISOString() };
  } catch {
    return { data: null, error: 'Count unavailable', checkedAt: new Date().toISOString() };
  }
}

export async function loadOperations(userId: string): Promise<Snapshot> {
  if (!await verifyOwner(userId)) throw new Error('Owner access is required.');
  // One consistent reporting window. Labels explicitly say UTC.
  const now = new Date();
  const windowEnd = now.toISOString();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const signal = () => AbortSignal.timeout(15000);
  const [requests, agents, outlets, uploads, reviews, sentToday, repliesToday] = await Promise.all([
    feed(supabase.from('foia_request_jobs')
      .select('id,request_type,status,jurisdiction,state,updated_at,sent_at,response_due_at,retry_count', { count: 'exact' })
      .order('updated_at', { ascending: false }).order('id').limit(100).abortSignal(signal())),
    feed(supabase.from('agent_runs')
      .select('id,agent_name,status,created_at,cost_usd,duration_ms', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id').limit(100).abortSignal(signal())),
    feed(supabase.from('press_accounts').select('id,name,domain,email,is_active', { count: 'exact' })
      .order('name').limit(100).abortSignal(signal())),
    // Existing RLS limits uploads to the signed-in owner's own deliveries.
    feed(supabase.from('upload_jobs')
      .select('id,filename,status,created_at,finished_at,processed_rows,bad_addresses,source_type', { count: 'exact' })
      .eq('user_id', userId).order('created_at', { ascending: false }).order('id').limit(100).abortSignal(signal())),
    feed(supabase.from('v_needs_human_review_queue')
      .select('domain,job_id,job_subtype,jurisdiction,state,created_at,updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false }).order('job_id').limit(100).abortSignal(signal())),
    countFeed(supabase.from('foia_request_jobs').select('id', { count: 'exact', head: true })
      .gte('sent_at', windowStart).lte('sent_at', windowEnd).abortSignal(signal())),
    countFeed(supabase.from('foia_responses').select('id', { count: 'exact', head: true })
      .gte('received_at', windowStart).lte('received_at', windowEnd).abortSignal(signal())),
  ]);
  return { requests, agents, outlets, uploads, reviews, sentToday, repliesToday, windowStart, windowEnd };
}

export function collectionType(type: string): 'code' | 'water' | 'other' {
  const normalized = type.toLowerCase().replace(/[ -]/g, '_');
  if (['code_violation', 'code_violations', 'code_enforcement'].includes(normalized)) return 'code';
  if (['water_shutoff', 'water_shutoffs', 'water_disconnection', 'water_disconnect'].includes(normalized)) return 'water';
  return 'other';
}
export function knownCost(runs: AgentRun[]): number | null {
  // Missing costs must never become a misleading zero-dollar total.
  if (!runs.length || runs.some(r => r.cost_usd == null || !Number.isFinite(r.cost_usd))) return null;
  return runs.reduce((sum, r) => sum + r.cost_usd!, 0);
}
export function safeWebsite(domain: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(domain) ? domain : 'https://' + domain);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return null;
    return url.href;
  } catch { return null; }
}
