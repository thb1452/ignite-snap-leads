import { ownerClient, OWNER_API_URL, OWNER_PUBLIC_KEY } from './client';
import type { Database } from '@/integrations/supabase/types';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type RequestJob = Pick<Row<'foia_request_jobs'>, 'id' | 'request_type' | 'status' | 'jurisdiction' | 'state' | 'updated_at' | 'sent_at' | 'response_due_at' | 'retry_count'>;
export type AgentRun = Pick<Row<'agent_runs'>, 'id' | 'agent_name' | 'status' | 'created_at' | 'cost_usd' | 'duration_ms'>;
export type Outlet = Pick<Row<'press_accounts'>, 'id' | 'name' | 'domain' | 'email' | 'is_active'> & { daily_send_limit: number | null; emails_sent_today: number | null; last_send_reset_date: string | null; deliverability_score: number | null; last_health_check_at: string | null };
export type Upload = Pick<Row<'upload_jobs'>, 'id' | 'filename' | 'status' | 'created_at' | 'finished_at' | 'processed_rows' | 'bad_addresses' | 'source_type'>;
export type Review = Omit<Database['public']['Views']['v_needs_human_review_queue']['Row'], 'error_message'>;
export type Feed<T> = { data: T | null; error: string | null; checkedAt: string; total?: number };
export type MailReviewHealth = { worker_name: string; version: string; last_success_at: string | null; last_error_code: string | null };
export type MailReviewSuggestion = { inbox_id: string; message_id: string; processor_version: string; request_job_id: string | null; match_state: string; processed_at: string; next_action: string | null; signals: string[] | null; review_state: string | null; usable_records: boolean | null };
export type CollectionDelivery = { id: string; source_name: string; jurisdiction: string; state: string; record_type: string; collected_at: string; freshness: string; source_rows: number; customer_accepted: boolean; usable_records: boolean; registered_at: string };
export type CollectionProcessing = { id: string; delivery_id: string; processor_version: string; staged_at: string; input_rows: number; candidate_rows: number; duplicate_rows: number; held_rows: number; source_case_count: number | null; candidate_case_count: number | null; review_state: string; customer_accepted: boolean; usable_records: boolean; registered_at: string };
export type CollectionOriginal = { delivery_id: string; role: string; storage_kind: string };
export type ArchivePlan = { id: string; delivery_id: string; artifact_count: number; registered_at: string };
export type ArchiveVerification = { id: string; plan_id: string; delivery_id: string; verified_at: string; artifact_count: number; registered_at: string };
export type ArchiveCopy = { id: string; delivery_id: string; storage_kind: string };
export type ArchiveJob = { id: string; delivery_id: string; processing_run_id: string; state: string; attempt_count: number; next_attempt_at: string; lease_expires_at: string | null; verification_id: string | null; last_error_code: string | null; created_at: string; updated_at: string };
export type CollectionEditorial = { id: string; delivery_id: string; processing_run_id: string; outlet_name: string; title: string; review_state: string; published: boolean; registered_at: string };
export type AcquisitionControls = { atlas_live_enabled: boolean | null; foia_paused: boolean | null; blocked_states: string[] | null };
export type AcquisitionPolicy = { revision: string; approved: boolean; global_paused: boolean };
export type StateAssignment = { state: string; outlet_id: string; revision: string; approved: boolean; starts_on: string; ends_on: string | null };
export type AcquisitionHistory = { revision: string; complete: boolean; reviewed_at: string; valid_until: string };
export type AcquisitionHealth = { kind: string; checked_at: string; available: boolean };
export type AcquisitionCapacity = { revision: string; checked_at: string; window_start: string; window_end: string; utc_day: string; submission_slots_available: number; outbound_messages_available: number };
export type Snapshot = {
  mailboxSync?: Feed<{ inbox_id: string; enabled: boolean; checked_at: string | null; last_success_at: string | null; last_error_code: string | null; scan_before: string | null }[]>;
  mailboxReview?: Feed<{ inbox_id: string; message_id: string; received_at: string; stored_at: string; sender: string; subject: string | null; review_state: string }[]>;
  mailboxTests?: Feed<number>;
  mailReviewHealth?: Feed<MailReviewHealth[]>;
  publicDownloadHealth?: Feed<(MailReviewHealth & { status: string | null })[]>;
  acquisitionControls?: Feed<AcquisitionControls>;
  acquisitionPolicy?: Feed<AcquisitionPolicy[]>;
  acquisitionAssignments?: Feed<StateAssignment[]>;
  acquisitionHistory?: Feed<AcquisitionHistory[]>;
  acquisitionHealth?: Feed<AcquisitionHealth[]>;
  acquisitionCapacity?: Feed<AcquisitionCapacity[]>;
  mailboxSuggestions?: Feed<MailReviewSuggestion[]>;
  collectionDeliveries?: Feed<CollectionDelivery[]>;
  collectionProcessing?: Feed<CollectionProcessing[]>;
  collectionOriginals?: Feed<CollectionOriginal[]>;
  archivePlans?: Feed<ArchivePlan[]>;
  archiveVerifications?: Feed<ArchiveVerification[]>;
  archiveCopies?: Feed<ArchiveCopy[]>;
  archiveJobs?: Feed<ArchiveJob[]>;
  archiveControl?: Feed<{ enabled: boolean | null }>;
  collectionEditorial?: Feed<CollectionEditorial[]>;
  freshCollectionCount?: Feed<number>;
  customerAcceptedCollections?: Feed<number>;
  requests: Feed<RequestJob[]>; agents: Feed<AgentRun[]>; outlets: Feed<Outlet[]>;
  uploads: Feed<Upload[]>; reviews: Feed<Review[]>;
  sentToday: Feed<number>; repliesToday: Feed<number>;
  registry: Feed<{ id: string; name: string; role: string; status: string; last_heartbeat: string | null }[]>;
  research: Feed<{ id: string; county: string; state: string; status: string; started_at: string; attempted_count: number; found_verified_count: number; found_third_party_count: number; error_count: number }[]>;
  tasks: Feed<{ id: string; task_type: string; agent_role: string; county: string | null; state: string | null; status: string; updated_at: string; heartbeat_at: string | null }[]>;
  publishing: { name: string; domain: string; checkedAt: string; siteStatus: number | null; error: string | null; articles: { total: number | null; rows: { id: string; title: string; url: string; publishedAt: string }[] } | null }[];
  taskReviews: Snapshot['tasks'];
  source: 'worker'; checkedAt: string;
  windowStart: string; windowEnd: string;
};

async function ownerRequest(accessOnly = false) {
  const { data: { session } } = await ownerClient.auth.getSession();
  if (!session) throw new Error('Sign in to your owner account.');
  const response = await fetch(OWNER_API_URL + '/functions/v1/owner-operations' + (accessOnly ? '?access=1' : ''), {
    headers: { Authorization: 'Bearer ' + session.access_token, apikey: OWNER_PUBLIC_KEY },
    signal: AbortSignal.timeout(45000), cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('The worker connection is unavailable. Try again.');
  return response.json();
}
export async function verifyOwner(_userId: string): Promise<boolean> {
  const result = await ownerRequest(true);
  return result?.authorized === true;
}
export async function loadOperations(_userId: string): Promise<Snapshot> {
  const result = await ownerRequest();
  if (!result) throw new Error('Owner access could not be verified.');
  if (result.source !== 'worker' || !result.requests || !result.agents || !result.outlets || !Array.isArray(result.publishing)) throw new Error('Invalid worker response.');
  return result as Snapshot;
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
