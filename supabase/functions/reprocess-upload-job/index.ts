import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const columns = 'id,user_id,status';
class RecoveryFailure extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}
const result = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
function currentUser(user: unknown): user is { id: string } {
  if (!user || typeof user !== 'object') return false;
  const u = user as Record<string, unknown>;
  const banned = typeof u.banned_until === 'string' ? Date.parse(u.banned_until) : 0;
  return typeof u.id === 'string' && uuid.test(u.id) && u.is_anonymous !== true && !u.deleted_at
    && !u.disabled && !u.is_disabled && !(banned > Date.now())
    && Boolean(u.email_confirmed_at || u.phone_confirmed_at || u.confirmed_at);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return result(405, { error: 'Use POST.', code: 'method_not_allowed' });
  const controller = new AbortController();
  const cancel = () => expire?.();
  let expire: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => { expire = () => {
    controller.abort(); reject(new RecoveryFailure('recovery_unconfirmed', 504, 'Recovery could not be confirmed. Refresh the job before taking any further action.'));
  }; });
  const timer = setTimeout(() => expire?.(), 15000);
  req.signal.addEventListener('abort', cancel, { once: true });
  if (req.signal.aborted) controller.abort();
  const check = () => { if (controller.signal.aborted) throw new RecoveryFailure('recovery_unconfirmed', 504, 'Recovery could not be confirmed. Refresh the job before taking any further action.'); };
  const bounded = async <T>(promise: PromiseLike<T>): Promise<T> => { check(); const value = await Promise.race([Promise.resolve(promise), deadline]); check(); return value; };
  try {
    check();
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!url.startsWith('https://') || !anon) throw new RecoveryFailure('configuration_unavailable', 503, 'Upload recovery is unavailable.');
    const authorization = req.headers.get('authorization') ?? '';
    if (!/^Bearer [^\s]+$/.test(authorization) || authorization.slice(7) === anon) throw new RecoveryFailure('owner_auth_required', 401, 'Sign in to check your upload.');
    const client = createClient(url, anon, {
      global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = await bounded(client.auth.getUser(authorization.slice(7)));
    if (auth.error || !currentUser(auth.data?.user)) throw new RecoveryFailure('owner_auth_required', 401, 'Sign in to check your upload.');
    const actor = auth.data.user.id;
    const text = await bounded(req.text());
    if (text.length > 2048) throw new RecoveryFailure('invalid_request', 400, 'A single upload job is required.');
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { throw new RecoveryFailure('invalid_request', 400, 'A single upload job is required.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).join() !== 'jobId'
      || typeof (payload as { jobId?: unknown }).jobId !== 'string' || !uuid.test((payload as { jobId: string }).jobId)) {
      throw new RecoveryFailure('invalid_request', 400, 'A single upload job is required.');
    }
    const jobId = (payload as { jobId: string }).jobId;
    // This uses the caller's JWT and owner predicate. There is no admin/service
    // bypass, job reset, staging deletion, counter clearing or source rewrite.
    const readJob = () => client.from('upload_jobs').select(columns).eq('id', jobId).eq('user_id', actor).maybeSingle();
    const loaded = await bounded(readJob());
    if (loaded.error) throw new RecoveryFailure('job_lookup_unavailable', 503, 'The upload status could not be checked. Nothing was reset.');
    if (!loaded.data || loaded.data.id !== jobId || loaded.data.user_id !== actor) throw new RecoveryFailure('job_not_found', 404, 'This upload is not available to your account.');
    const staging = await bounded(client.from('upload_staging').select('job_id', { count: 'exact', head: true }).eq('job_id', jobId));
    if (staging.error || !Number.isSafeInteger(staging.count) || staging.count! < 0) throw new RecoveryFailure('staging_lookup_unavailable', 503, 'Existing processing evidence could not be checked. Nothing was reset.');
    const finalAuth = await bounded(client.auth.getUser(authorization.slice(7)));
    if (finalAuth.error || !currentUser(finalAuth.data?.user) || finalAuth.data.user.id !== actor) throw new RecoveryFailure('owner_auth_required', 401, 'Your account could not be verified. Nothing was reset.');
    check();
    // No existing subscription/source-acceptance contract authorizes processor
    // recovery. process-upload can escalate to service-backed AI/geocoding, and
    // its stale-job fallback is not a leased replay. Ownership alone cannot
    // release either path. This hold has no request/env/admin override.
    return result(503, { version: 'upload-recovery-v1', code: 'processing_recovery_held',
      error: 'Processing recovery is on hold pending account and source authorization. Your job and processing evidence were preserved; no restart was requested.',
      jobId, actorUserId: actor, jobStatus: loaded.data.status, stagedRows: staging.count,
      accepted: false, restarted: false, evidenceReset: false, originalIdsPreserved: true, retrySafe: false });

  } catch (error) {
    const failure = error instanceof RecoveryFailure ? error : new RecoveryFailure('recovery_unavailable', 503, 'Upload recovery is unavailable. Nothing was reset.');
    return result(failure.status, { version: 'upload-recovery-v1', error: failure.message, code: failure.code,
      accepted: false, restarted: false, evidenceReset: false, retrySafe: false });
  } finally {
    clearTimeout(timer); req.signal.removeEventListener('abort', cancel); controller.abort();
  }
});
