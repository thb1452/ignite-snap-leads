import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/externalClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

export interface UploadJob {
  id: string;
  user_id?: string;
  updated_at?: string | null;
  status: 'QUEUED' | 'PARSING' | 'PROCESSING' | 'DEDUPING' | 'CREATING_VIOLATIONS' | 'FINALIZING' | 'COMPLETE' | 'FAILED';
  total_rows: number | null;
  processed_rows: number | null;
  properties_created: number | null;
  properties_matched: number | null;
  violations_created: number | null;
  violations_updated: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  bad_addresses: number | null;
  bad_address_samples: string[] | null;
}

export function useUploadJob(jobId: string | null) {
  const { user, loading: authLoading } = useAuth();
  const ownerId = user?.id ?? null;
  const key = ownerId && jobId ? `${ownerId}:${jobId}` : null;
  const [snapshot, setSnapshot] = useState<{ key: string | null; job: UploadJob | null; loading: boolean }>({ key: null, job: null, loading: true });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();
  const refresh = useCallback(() => setRefreshTrigger(previous => previous + 1), []);

  useEffect(() => {
    setSnapshot({ key, job: null, loading: Boolean(key) });
    if (!key || !ownerId || !jobId || authLoading) return;
    const lifetime = new AbortController();
    let poll: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let failureNotified = false;
    let stalledNotified = false;
    let terminal: string | null = null;
    const fetchJob = async () => {
      if (inFlight || lifetime.signal.aborted) return;
      inFlight = true;
      const request = new AbortController();
      const cancel = () => request.abort();
      lifetime.signal.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(cancel, 10000);
      try {
        const { data, error } = await supabase.from('upload_jobs').select('id,user_id,status,total_rows,processed_rows,properties_created,properties_matched,violations_created,violations_updated,error_message,started_at,finished_at,bad_addresses,bad_address_samples,updated_at,warnings')
          .eq('id', jobId).eq('user_id', ownerId).abortSignal(request.signal).single();
        if (lifetime.signal.aborted) return;
        if (request.signal.aborted || error || !data || data.id !== jobId || data.user_id !== ownerId) {
          setSnapshot({ key, job: null, loading: false });
          if (!failureNotified) toast({ title: 'Upload status unavailable', description: 'The job could not be checked for your account. No restart was requested.', variant: 'destructive' });
          failureNotified = true;
          return;
        }
        // Counters, warnings and evidence updates matter even when status is unchanged.
        setSnapshot({ key, job: data as UploadJob, loading: false });
        const previousTerminal = terminal;
        terminal = data.status === 'COMPLETE' || data.status === 'FAILED' ? data.status : null;
        if (terminal && previousTerminal !== terminal) {
          toast(terminal === 'COMPLETE'
            ? { title: 'Upload processing complete', description: 'The saved job reports completion. Source review and customer acceptance remain separate.' }
            : { title: 'Upload needs review', description: 'The saved job reports a failure. Its processing evidence has been preserved.', variant: 'destructive' });
        }
        const changedAt = data.updated_at ? Date.parse(data.updated_at) : NaN;
        if (!terminal && Number.isFinite(changedAt) && Date.now() - changedAt > 3 * 60 * 1000 && !stalledNotified) {
          stalledNotified = true;
          toast({ title: 'Upload status has not changed recently', description: 'Refresh or review this job before recovery. No automatic restart was requested.' });
        }
      } catch {
        if (!lifetime.signal.aborted) {
          setSnapshot({ key, job: null, loading: false });
          if (!failureNotified) toast({ title: 'Upload status unavailable', description: 'The job could not be checked. No restart was requested.', variant: 'destructive' });
          failureNotified = true;
        }
      } finally {
        clearTimeout(timeout); lifetime.signal.removeEventListener('abort', cancel); inFlight = false;
        if (!lifetime.signal.aborted && !terminal) {
          if (poll) clearTimeout(poll);
          poll = setTimeout(() => void fetchJob(), 2000);
        }
      }
    };
    void fetchJob();
    const channel = supabase.channel(`upload_job_${ownerId}_${jobId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'upload_jobs', filter: `id=eq.${jobId}` }, () => {
        // Realtime is only an invalidation hint. Re-read through owner scope;
        // never display an unverified event body or a late former-account row.
        if (!lifetime.signal.aborted) void fetchJob();
      }).subscribe();
    return () => {
      lifetime.abort(); if (poll) clearTimeout(poll); void supabase.removeChannel(channel);
    };
  }, [key, ownerId, jobId, authLoading, toast, refreshTrigger]);

  return { job: snapshot.key === key && !authLoading ? snapshot.job : null,
    loading: authLoading || Boolean(key && (snapshot.key !== key || snapshot.loading)), refresh };
}
