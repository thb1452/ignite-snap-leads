import type { Snapshot } from './operations';

type Input = Pick<Snapshot, 'archiveJobs' | 'archiveControl' | 'archiveVerifications' | 'collectionDeliveries'>;
export type ArchiveJobView = {
  id: string; sourceName: string; label: string; nextAction: string; errorReason: string | null;
  attempt: number | null; updatedAt: string | null; scheduledAt: string | null;
  leaseExpiresAt: string | null; verifiedAt: string | null; proofNote: string | null; nextChange: number | null;
};
const DAY = 86_400_000;
const time = (v: unknown) => typeof v === 'string' ? Date.parse(v) : NaN;
const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 80;
const errors: Record<string, string> = {
  interrupted: 'An earlier attempt was interrupted.', archive_incomplete: 'Some archive files could not be verified.',
  archive_failed: 'The backup attempt failed.', archive_paused: 'Automatic backup was paused.',
  archive_control_missing: 'The backup control was missing.', archive_control_invalid: 'The backup control was invalid.',
  archive_deadline: 'The attempt reached its time limit.', archive_request_limit: 'The attempt reached its request limit.',
  local_evidence_invalid: 'The local source evidence was missing or changed.', archive_attempts_exhausted: 'The automatic attempt limit was reached.',
};

/** Queue observations only. This never changes the separately reconciled backup or collection totals. */
export function archiveJobSummary(data: Input, now = Date.now()) {
  const feed = data.archiveJobs;
  const available = !!feed && !feed.error && Array.isArray(feed.data);
  const total = available && Number.isSafeInteger(feed.total) && feed.total! >= feed.data!.length ? feed.total! : null;
  const complete = available && total === feed.data!.length;
  const control = data.archiveControl;
  const enabled = !control?.error && typeof control?.data?.enabled === 'boolean' ? control.data.enabled : null;
  const waiting = (otherwise: string) => enabled === false
    ? 'Automatic backup is paused. Review the pause before expecting another attempt.'
    : enabled === null ? 'Check the backup worker configuration before expecting another attempt.' : otherwise;
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const job of available ? feed.data! : []) {
    if (id(job?.id) && seen.has(job.id)) duplicates.add(job.id);
    else if (id(job?.id)) seen.add(job.id);
  }
  seen.clear();
  const rows: ArchiveJobView[] = [];
  for (const [index, job] of (available ? feed.data! : []).entries()) {
    if (id(job?.id) && seen.has(job.id)) continue;
    if (id(job?.id)) seen.add(job.id);
    const source = !data.collectionDeliveries?.error && data.collectionDeliveries?.data?.find(d => d.id === job?.delivery_id);
    const base: ArchiveJobView = { id: id(job?.id) ? job.id : `unavailable-${index}`, sourceName: source?.source_name || 'Source details unavailable',
      label: 'Backup job needs review', nextAction: 'Check the recorded job metadata before expecting progress.',
      errorReason: null, attempt: null, updatedAt: null, scheduledAt: null, leaseExpiresAt: null, verifiedAt: null, proofNote: null, nextChange: null };
    const validError = job?.last_error_code === null || (typeof job?.last_error_code === 'string' && Object.prototype.hasOwnProperty.call(errors, job.last_error_code));
    if (!job || !id(job.id) || !id(job.delivery_id) || !id(job.processing_run_id) || duplicates.has(job.id)
      || !Number.isFinite(now) || !['queued', 'leased', 'retry_wait', 'held', 'verified'].includes(job.state)
      || !Number.isSafeInteger(job.attempt_count) || job.attempt_count < 0 || job.attempt_count > 4
      || ![job.created_at, job.updated_at, job.next_attempt_at].every(v => Number.isFinite(time(v)))
      || time(job.created_at) > now + 5000 || time(job.updated_at) > now + 5000
      || time(job.updated_at) < time(job.created_at) - 5000 || !validError
      || (job.state === 'queued' && job.attempt_count !== 0)
      || (['leased', 'retry_wait', 'verified'].includes(job.state) && job.attempt_count === 0)
      || (job.state === 'retry_wait' && job.attempt_count >= 4)
      || (job.state !== 'leased' && job.lease_expires_at !== null)
      || (job.state !== 'verified' && job.verification_id !== null)) {
      rows.push(base); continue;
    }
    base.attempt = job.attempt_count;
    base.updatedAt = job.updated_at;
    base.errorReason = job.last_error_code === null ? null : errors[job.last_error_code];
    if (job.state === 'queued') {
      base.label = 'Backup queued';
      base.nextAction = waiting('Await the next permitted worker run. An enabled control does not confirm a scheduled run.');
    } else if (job.state === 'leased') {
      if (!Number.isFinite(time(job.lease_expires_at))) { rows.push(base); continue; }
      base.leaseExpiresAt = job.lease_expires_at;
      if (time(job.lease_expires_at) > now) {
        base.label = 'Backup attempt in progress';
        base.nextAction = waiting('Await the recorded attempt result. An unexpired lease alone does not prove the process is still running.');
        base.nextChange = time(job.lease_expires_at);
      } else {
        base.label = 'Recovery pending';
        base.nextAction = waiting(job.attempt_count === 4 ? 'The next permitted run must hold this exhausted job for review.' : 'The next permitted worker run can recover the interrupted attempt.');
      }
    } else if (job.state === 'retry_wait') {
      base.scheduledAt = job.next_attempt_at;
      base.label = time(job.next_attempt_at) > now ? 'Retry scheduled' : 'Retry due';
      base.nextAction = waiting('Await the next permitted worker run. The scheduled time does not prove another attempt has started.');
      if (time(job.next_attempt_at) > now) base.nextChange = time(job.next_attempt_at);
    } else if (job.state === 'held') {
      base.label = 'Backup needs review';
      base.nextAction = job.last_error_code === 'local_evidence_invalid'
        ? 'Recover and verify the source evidence. Automatic retries have stopped; this job is not reset automatically.'
        : 'Review the failed attempts and evidence. Automatic retries have stopped; this job is not reset automatically.';
    } else {
      base.label = 'Completion needs verification';
      base.nextAction = 'Check this job’s recorded proof. Current backup status remains separate.';
      const proofs = !data.archiveVerifications?.error && data.archiveVerifications?.data?.filter(p => p.id === job.verification_id);
      const proof = proofs && proofs.length === 1 ? proofs[0] : null;
      if (!id(job.verification_id) || job.last_error_code !== null || !proof || proof.delivery_id !== job.delivery_id
        || !Number.isSafeInteger(proof.artifact_count) || proof.artifact_count <= 0 || proof.artifact_count > 100
        || !Number.isFinite(time(proof.verified_at)) || time(proof.verified_at) > now + 5000
        || time(proof.verified_at) < time(job.created_at) - 5000) {
        base.proofNote = 'A matching, valid proof is unavailable or outside this view.';
      } else {
        base.label = 'Backup job finished'; base.verifiedAt = proof.verified_at;
        const stale = now - time(proof.verified_at) > DAY;
        base.proofNote = stale ? 'Recheck due: this file check is older than 24 hours.' : 'Recorded file check is within 24 hours; current complete-backup status is shown separately.';
        base.nextAction = stale ? 'Obtain a new check of the saved archive plan when needed. This finished job does not refresh itself.' : 'No further automatic attempt is expected for this finished job. Review current backup evidence above.';
        if (!stale) base.nextChange = time(proof.verified_at) + DAY + 1;
      }
    }
    rows.push(base);
  }
  return { available, complete, total, enabled, rows };
}
