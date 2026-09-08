import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveJobSummary } from '../src/services/owner/archive-job-status.ts';
import { backupSummary } from '../src/services/owner/backup-status.ts';
import type { ArchiveJob, Snapshot } from '../src/services/owner/operations.ts';

const now = Date.parse('2026-09-08T04:00:00Z');
const at = (offset = 0) => new Date(now + offset).toISOString();
const feed = <T>(data: T) => ({ data, error: null, checkedAt: at(), ...(Array.isArray(data) ? { total: data.length } : {}) });
function sample(change: Partial<ArchiveJob> = {}) {
  const job: ArchiveJob = { id: 'job-one', delivery_id: 'delivery-one', processing_run_id: 'run-one', state: 'queued', attempt_count: 0,
    next_attempt_at: at(), lease_expires_at: null, verification_id: null, last_error_code: null, created_at: at(-60000), updated_at: at(), ...change };
  return { archiveJobs: feed([job]), archiveControl: feed({ enabled: true }),
    collectionDeliveries: feed([{ id: 'delivery-one', source_name: 'Synthetic collection' }]),
    archivePlans: feed([{ id: 'plan-one', delivery_id: 'delivery-one', artifact_count: 1, registered_at: at(-60000) }]),
    archiveVerifications: feed([{ id: 'proof-one', plan_id: 'plan-one', delivery_id: 'delivery-one', verified_at: at(), artifact_count: 1, registered_at: at() }]),
    archiveCopies: feed([{ id: 'copy-one', delivery_id: 'delivery-one', storage_kind: 'supabase_private' }]) } as Pick<Snapshot,
      'archiveJobs' | 'archiveControl' | 'collectionDeliveries' | 'archivePlans' | 'archiveVerifications' | 'archiveCopies'>;
}
test('queue missing, complete empty and truncated observations remain distinct', () => {
  assert.equal(archiveJobSummary({}, now).available, false);
  const data = sample(); data.archiveJobs = feed([]);
  assert.equal(archiveJobSummary(data, now).complete, true);
  data.archiveJobs.total = 1000;
  const partial = archiveJobSummary(data, now); assert.equal(partial.complete, false); assert.equal(partial.total, 1000);
  data.archiveJobs = { data: null, error: 'unavailable', checkedAt: at() };
  assert.equal(archiveJobSummary(data, now).total, null);
});
test('queued jobs wait without claiming that a worker or timer is running', () => {
  const row = archiveJobSummary(sample(), now).rows[0];
  assert.equal(row.label, 'Backup queued'); assert.match(row.nextAction, /does not confirm a scheduled run/);
  assert.equal(row.attempt, 0);
});
test('only the exact boolean backup control determines waiting instructions', () => {
  const data = sample(); data.archiveControl = feed({ enabled: false });
  assert.match(archiveJobSummary(data, now).rows[0].nextAction, /paused/);
  for (const value of [null, 'true', 1, {}]) {
    data.archiveControl = feed({ enabled: value }) as never;
    const result = archiveJobSummary(data, now); assert.equal(result.enabled, null); assert.match(result.rows[0].nextAction, /configuration/);
  }
  data.archiveControl = { data: { enabled: true }, error: 'failure', checkedAt: at() };
  assert.equal(archiveJobSummary(data, now).enabled, null);
});
test('lease expiry switches progress to recovery, including exhausted fourth attempt', () => {
  const data = sample({ state: 'leased', attempt_count: 2, lease_expires_at: at(1000) });
  const before = archiveJobSummary(data, now).rows[0]; assert.equal(before.label, 'Backup attempt in progress'); assert.equal(before.nextChange, now + 1000);
  assert.equal(archiveJobSummary(data, now + 1000).rows[0].label, 'Recovery pending');
  data.archiveJobs!.data![0].attempt_count = 4;
  assert.match(archiveJobSummary(data, now + 1000).rows[0].nextAction, /hold this exhausted job/);
});
test('retry due dates do not claim an attempt and exhausted retries are invalid', () => {
  const data = sample({ state: 'retry_wait', attempt_count: 3, next_attempt_at: at(1000), last_error_code: 'archive_deadline' });
  assert.equal(archiveJobSummary(data, now).rows[0].label, 'Retry scheduled');
  assert.equal(archiveJobSummary(data, now + 1000).rows[0].label, 'Retry due');
  assert.match(archiveJobSummary(data, now + 1000).rows[0].errorReason!, /time limit/);
  data.archiveJobs!.data![0].attempt_count = 4;
  assert.equal(archiveJobSummary(data, now).rows[0].label, 'Backup job needs review');
});
test('held evidence failures do not promise another automatic retry', () => {
  const row = archiveJobSummary(sample({ state: 'held', last_error_code: 'local_evidence_invalid' }), now).rows[0];
  assert.equal(row.label, 'Backup needs review'); assert.match(row.nextAction, /Recover and verify/); assert.match(row.nextAction, /not reset automatically/);
});
test('verified jobs display the referenced actual proof date and age without renewing it', () => {
  const data = sample({ state: 'verified', attempt_count: 1, verification_id: 'proof-one' });
  let row = archiveJobSummary(data, now).rows[0]; assert.equal(row.label, 'Backup job finished'); assert.equal(row.verifiedAt, at());
  row = archiveJobSummary(data, now + 86_400_001).rows[0]; assert.match(row.proofNote!, /Recheck due/); assert.equal(row.verifiedAt, at());
});
test('proof mismatches, missing proofs and future dates cannot certify a finished backup', () => {
  for (const scenario of ['delivery', 'id', 'date', 'count', 'missing', 'duplicate']) {
    const data = sample({ state: 'verified', attempt_count: 1, verification_id: 'proof-one' });
    const p = data.archiveVerifications!.data![0];
    if (scenario === 'delivery') p.delivery_id = 'other';
    if (scenario === 'id') p.id = 'other';
    if (scenario === 'date') p.verified_at = at(60000);
    if (scenario === 'count') p.artifact_count = 0;
    if (scenario === 'missing') data.archiveVerifications = feed([]);
    if (scenario === 'duplicate') data.archiveVerifications = feed([p, p]);
    const row = archiveJobSummary(data, now).rows[0]; assert.equal(row.label, 'Completion needs verification', scenario); assert.equal(row.verifiedAt, null);
  }
});
test('invalid states, timestamps, counts and unknown errors expose no raw values', () => {
  for (const patch of [{ state: 'SECRET' }, { created_at: 'bad-date' }, { updated_at: at(60000) }, { attempt_count: -1 }, { last_error_code: 'SECRET' }, { last_error_code: 'toString' }, { lease_expires_at: at(1000) }]) {
    const result = archiveJobSummary(sample(patch), now);
    assert.equal(result.rows[0].label, 'Backup job needs review'); assert.ok(!JSON.stringify(result).includes('SECRET'));
  }
});
test('duplicate job IDs require review rather than arbitrarily selecting a state', () => {
  const data = sample(); data.archiveJobs = feed([...data.archiveJobs!.data!, { ...data.archiveJobs!.data![0], state: 'held' }]);
  const result = archiveJobSummary(data, now); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].label, 'Backup job needs review');
});
test('multiple jobs for one collection do not change independently reconciled backup totals', () => {
  const data = sample({ state: 'verified', attempt_count: 1, verification_id: 'proof-one' });
  const before = backupSummary(data, now);
  data.archiveJobs!.data!.push({ ...data.archiveJobs!.data![0], id: 'job-two', processing_run_id: 'run-two' }); data.archiveJobs!.total = 2;
  const saved = JSON.stringify(data); assert.equal(archiveJobSummary(data, now).rows.length, 2); assert.equal(JSON.stringify(data), saved);
  assert.deepEqual(backupSummary(data, now), before); assert.equal(before.recent, 1);
});
