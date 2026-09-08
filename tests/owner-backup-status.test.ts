import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupSummary } from '../src/services/owner/backup-status.ts';
import type { Snapshot } from '../src/services/owner/operations.ts';

const now = Date.parse('2026-09-08T03:00:00Z');
const date = new Date(now).toISOString();
const feed = <T>(data: T[]) => ({ data, total: data.length, error: null, checkedAt: date });
function sample() {
  return {
    collectionDeliveries: feed([{ id: 'd1', source_name: 'Synthetic source' }]),
    archivePlans: feed([{ id: 'p1', delivery_id: 'd1', artifact_count: 2, registered_at: new Date(now - 60000).toISOString() }]),
    archiveVerifications: feed([{ id: 'v1', plan_id: 'p1', delivery_id: 'd1', artifact_count: 2, verified_at: date, registered_at: date }]),
    archiveCopies: feed([{ id: 'a1', delivery_id: 'd1', storage_kind: 'supabase_private' }, { id: 'a2', delivery_id: 'd1', storage_kind: 'supabase_private' }]),
  } as Pick<Snapshot, 'collectionDeliveries' | 'archivePlans' | 'archiveVerifications' | 'archiveCopies'>;
}

test('backup counts deduplicate delivery rows, copies and repeated verification events', () => {
  const data = sample();
  data.collectionDeliveries = feed([...data.collectionDeliveries!.data!, ...data.collectionDeliveries!.data!]);
  data.archiveVerifications = feed([...data.archiveVerifications!.data!, { ...data.archiveVerifications!.data![0], id: 'v2' }]);
  data.archiveCopies = feed([...data.archiveCopies!.data!, ...data.archiveCopies!.data!]);
  const result = backupSummary(data, now);
  assert.equal(result.recent, 1); assert.equal(result.rows.length, 1); assert.equal(result.lastVerifiedAt, date);
  assert.ok(!JSON.stringify(result).includes('storage_kind')); assert.ok(!JSON.stringify(result).includes('artifact_count'));
});
test('a saved plan or location alone is pending rather than a verified backup', () => {
  const data = sample(); data.archiveVerifications = feed([]);
  let result = backupSummary(data, now);
  assert.equal(result.recent, 0); assert.equal(result.pending, 1); assert.equal(result.lastVerifiedAt, null);
  data.archivePlans = feed([]); result = backupSummary(data, now);
  assert.equal(result.pending, 1); assert.equal(result.rows[0].detail, 'No backup plan is recorded.');
});
test('newer plan awaiting verification does not inherit an older plan success', () => {
  const data = sample();
  data.archivePlans = feed([...data.archivePlans!.data!, { id: 'p2', delivery_id: 'd1', artifact_count: 2, registered_at: date }]);
  const result = backupSummary(data, now);
  assert.equal(result.recent, 0); assert.equal(result.pending, 1);
});
test('older checks are stale and refreshing the dashboard does not renew their date', () => {
  const data = sample(); const later = now + 25 * 3600000;
  const result = backupSummary(data, later);
  assert.equal(result.recent, 0); assert.equal(result.stale, 1); assert.equal(result.lastVerifiedAt, date);
  assert.equal(result.rows[0].state, 'stale');
});
test('equally recent distinct plans remain ambiguous instead of choosing by UUID', () => {
  const data = sample();
  data.archivePlans = feed([...data.archivePlans!.data!, { ...data.archivePlans!.data![0], id: 'p2' }]);
  const result = backupSummary(data, now);
  assert.equal(result.recent, null); assert.equal(result.rows[0].state, 'unavailable');
  assert.equal(result.rows[0].detail, 'Latest backup plan is ambiguous.');
});
test('unavailable or truncated feeds never become zero backups', () => {
  for (const key of ['archivePlans', 'archiveVerifications', 'archiveCopies', 'collectionDeliveries'] as const) {
    const data = sample(); const old = data[key]!;
    data[key] = { ...old, data: null, error: 'Unavailable' } as never;
    let result = backupSummary(data, now); assert.equal(result.recent, null); assert.equal(result.pending, null);
    data[key] = { ...old, total: old.data!.length + 1 } as never;
    result = backupSummary(data, now); assert.equal(result.recent, null); assert.equal(result.complete, false);
  }
});
test('missing copies, wrong-plan proofs and inconsistent file counts cannot verify', () => {
  const data = sample(); data.archiveCopies = feed([data.archiveCopies!.data![0]]);
  assert.equal(backupSummary(data, now).rows[0].state, 'unavailable');
  const other = sample(); other.archiveVerifications!.data![0].plan_id = 'unrelated';
  assert.equal(backupSummary(other, now).rows[0].state, 'pending');
  const mismatch = sample(); mismatch.archiveVerifications!.data![0].artifact_count = 3;
  assert.equal(backupSummary(mismatch, now).rows[0].state, 'unavailable');
});
test('future and invalid verification timestamps are not recent success', () => {
  for (const value of ['bad-date', new Date(now + 60000).toISOString()]) {
    const data = sample(); data.archiveVerifications!.data![0].verified_at = value;
    const result = backupSummary(data, now); assert.equal(result.recent, null); assert.equal(result.uncertain, 1); assert.equal(result.lastVerifiedAt, null);
  }
});
test('complete empty collection register is explicitly zero without inventing a file check', () => {
  const result = backupSummary({ collectionDeliveries: feed([]), archivePlans: feed([]), archiveVerifications: feed([]), archiveCopies: feed([]) }, now);
  assert.equal(result.complete, true); assert.equal(result.recent, 0); assert.equal(result.lastVerifiedAt, null);
});
