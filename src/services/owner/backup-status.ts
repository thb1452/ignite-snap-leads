import type { Feed, Snapshot } from './operations';

type BackupSnapshot = Pick<Snapshot, 'collectionDeliveries' | 'archivePlans' | 'archiveVerifications' | 'archiveCopies'>;
export type BackupState = 'verified' | 'stale' | 'pending' | 'unavailable';
export type BackupRow = { deliveryId: string; sourceName: string; state: BackupState; detail: string; verifiedAt: string | null };
const DAY = 24 * 60 * 60 * 1000;
const time = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN;
const validCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 100;
function complete<T>(feed: Feed<T[]> | undefined) {
  return !!feed && !feed.error && Array.isArray(feed.data) && Number.isSafeInteger(feed.total) && feed.total === feed.data.length;
}

/** Display evidence only. A stored location is not an actual hash verification. */
export function backupSummary(data: BackupSnapshot, now = Date.now()) {
  const available = [data.collectionDeliveries, data.archivePlans, data.archiveVerifications, data.archiveCopies]
    .every(feed => !!feed && !feed.error && Array.isArray(feed.data));
  const covered = available && [data.collectionDeliveries, data.archivePlans, data.archiveVerifications, data.archiveCopies].every(complete);
  const deliveries = [...new Map((data.collectionDeliveries?.data ?? []).map(row => [row.id, row])).values()];
  const rows: BackupRow[] = deliveries.map(delivery => {
    const base = { deliveryId: delivery.id, sourceName: delivery.source_name, verifiedAt: null };
    if (!covered || !Number.isFinite(now)) return { ...base, state: 'unavailable', detail: available ? 'Backup list is incomplete.' : 'Backup evidence is unavailable.' };
    const plans = (data.archivePlans?.data ?? []).filter(plan => plan.delivery_id === delivery.id);
    if (!plans.length) return { ...base, state: 'pending', detail: 'No backup plan is recorded.' };
    if (plans.some(plan => !Number.isFinite(time(plan.registered_at)) || time(plan.registered_at) > now + 5000)) return { ...base, state: 'unavailable', detail: 'Backup plan dates need verification.' };
    plans.sort((a, b) => time(b.registered_at) - time(a.registered_at) || a.id.localeCompare(b.id));
    const plan = plans[0];
    if (plans.some(other => other.id !== plan.id && time(other.registered_at) === time(plan.registered_at))) return { ...base, state: 'unavailable', detail: 'Latest backup plan is ambiguous.' };
    if (!validCount(plan.artifact_count)) return { ...base, state: 'unavailable', detail: 'Backup file count needs verification.' };
    const proofs = (data.archiveVerifications?.data ?? []).filter(proof => proof.delivery_id === delivery.id && proof.plan_id === plan.id);
    if (!proofs.length) return { ...base, state: 'pending', detail: 'Saved plan is awaiting file verification.' };
    if (proofs.some(proof => !Number.isFinite(time(proof.verified_at)) || time(proof.verified_at) > now + 5000)) return { ...base, state: 'unavailable', detail: 'File verification dates need checking.' };
    proofs.sort((a, b) => time(b.verified_at) - time(a.verified_at) || a.id.localeCompare(b.id));
    const proof = proofs[0];
    const locations = new Set((data.archiveCopies?.data ?? []).filter(copy => copy.delivery_id === delivery.id && copy.storage_kind === 'supabase_private').map(copy => copy.id));
    if (proof.artifact_count !== plan.artifact_count || locations.size < plan.artifact_count || time(proof.verified_at) < time(plan.registered_at) - 5000) return { ...base, state: 'unavailable', detail: 'Saved plan, verification and private-copy records do not reconcile.' };
    return { ...base, verifiedAt: proof.verified_at, state: now - time(proof.verified_at) <= DAY ? 'verified' : 'stale', detail: now - time(proof.verified_at) <= DAY ? 'Latest saved plan verified within 24 hours.' : 'Last verified more than 24 hours ago; recheck due.' };
  });
  const dates = rows.map(row => row.verifiedAt).filter((value): value is string => !!value).sort((a, b) => time(b) - time(a));
  const reconciled = covered && !rows.some(row => row.state === 'unavailable');
  return { available, complete: covered, reconciled, rows, recent: reconciled ? rows.filter(row => row.state === 'verified').length : null,
    stale: covered ? rows.filter(row => row.state === 'stale').length : null,
    pending: reconciled ? rows.filter(row => row.state === 'pending').length : null,
    uncertain: covered ? rows.filter(row => row.state === 'unavailable').length : null,
    lastVerifiedAt: dates[0] ?? null };
}
