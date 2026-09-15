import { supabase } from '@/integrations/supabase/externalClient';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const pending = new Set<string>();
class RecoveryStatusError extends Error {}
const unavailable = 'Recovery could not be confirmed. No restart is confirmed; refresh the job before taking another action.';
const held = 'Processing recovery is on hold pending account and source authorization. Your original job and processing evidence were preserved; no restart was requested.';
export function recoveryMessage(value: unknown, jobId: string, actor: string): string {
  if (!value || typeof value !== 'object') return unavailable;
  const v = value as Record<string, unknown>;
  return v.version === 'upload-recovery-v1' && v.code === 'processing_recovery_held'
    && v.jobId === jobId && v.actorUserId === actor && v.accepted === false
    && v.restarted === false && v.evidenceReset === false && v.originalIdsPreserved === true && v.retrySafe === false
    ? held : unavailable;
}
export async function requestUploadRecovery(jobId: string): Promise<never> {
  if (!uuid.test(jobId)) throw new RecoveryStatusError('A single upload job is required.');
  let expire: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => { expire = () => reject(new RecoveryStatusError(unavailable)); });
  const timer = setTimeout(() => expire?.(), 15000);
  const bounded = <T>(promise: PromiseLike<T>) => Promise.race([Promise.resolve(promise), deadline]);
  let key: string | undefined;
  try {
    const { data: auth, error: authError } = await bounded(supabase.auth.getUser());
    if (authError || !auth.user || auth.user.is_anonymous) throw new RecoveryStatusError('Sign in to check your upload.');
    const actor = auth.user.id;
    key = `${actor}:${jobId}`;
    if (pending.has(key)) { key = undefined; throw new RecoveryStatusError('A recovery check is already in progress.'); }
    pending.add(key);
    const { data, error } = await bounded(supabase.functions.invoke('reprocess-upload-job', { body: { jobId } }));
    let assessment: unknown = data;
    // Non-2xx invokes usually resolve with an error object, rather than reject.
    // Decode only its structured response; never display raw transport messages.
    if (error?.context instanceof Response) {
      try { assessment = await bounded(error.context.clone().json()); } catch { assessment = null; }
    }
    const current = await bounded(supabase.auth.getUser());
    if (current.error || current.data.user?.id !== actor || current.data.user?.is_anonymous) {
      throw new RecoveryStatusError('Your account changed while recovery was checked. Refresh the job in the original account; no restart is confirmed.');
    }
    // This endpoint is a read-only held assessment. Even legacy 200/success:true
    // is not an execution acknowledgement and must never produce a retry toast.
    throw new RecoveryStatusError(recoveryMessage(assessment, jobId, actor));
  } catch (error) {
    if (error instanceof RecoveryStatusError) throw error;
    throw new RecoveryStatusError(unavailable);
  } finally { clearTimeout(timer); if (key) pending.delete(key); }
}
