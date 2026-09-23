// Local candidate. The installed intake/processor holds remain unchanged.
export type OriginalIdentity = { owner: string; sha256: string; bytes: number };
export type Reservation = {
  version: 'original-intake-v1'; owner_id: string; job_id: string;
  original_sha256: string; original_bytes: number; original_filename: string;
  bucket: 'csv-uploads'; object_key: string; created_at: string;
  state: 'reserved' | 'original_verified' | 'revoked';
  verification_id: string | null; verified_at: string | null; revocation_id: string | null;
  intake_enabled: boolean; source_classification: 'unclassified'; processing_authorized: false; customer_accepted: false;
};
export type Inspection = {
  reservation: Reservation; presence: 'absent' | 'matching';
  originalSaved: boolean; processingRequested: false;
};
export class IntakeError extends Error {
  constructor(readonly code: 'held' | 'owner_changed' | 'invalid_input' | 'binding_conflict' | 'revoked' | 'unconfirmed', readonly jobId: string | null = null) {
    super(code === 'unconfirmed' ? 'The original may already be saved. Check this same saved reference before another attempt.' :
      code === 'held' ? (jobId ? 'Original intake is paused. This saved reference is preserved; check its status. No processing was requested.' : 'New original intake is paused. Nothing new was saved.') :
      code === 'revoked' ? 'This original is on hold. No processing was requested.' :
      'This original could not be confirmed for your account. No processing was requested.');
    this.name = 'IntakeError';
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const productionOriginalIntakeEnabled = (): boolean => false;
export async function digestOriginal(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function validateIdentity(input: OriginalIdentity): void {
  if (!uuid.test(input.owner) || !/^[a-f0-9]{64}$/.test(input.sha256) || !Number.isSafeInteger(input.bytes) || input.bytes < 1 || input.bytes > 15728640) throw new IntakeError('invalid_input');
}
export function readReservation(value: unknown, identity: OriginalIdentity, expectedJob?: string): Reservation {
  validateIdentity(identity);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IntakeError('binding_conflict', expectedJob ?? null);
  const r = value as Reservation;
  if (r.version !== 'original-intake-v1' || r.owner_id !== identity.owner || r.original_sha256 !== identity.sha256 || r.original_bytes !== identity.bytes
    || !uuid.test(r.job_id) || expectedJob != null && r.job_id !== expectedJob || r.bucket !== 'csv-uploads'
    || r.object_key !== `_snap_originals/v1/${identity.owner}/${r.job_id}/${identity.sha256}.csv`
    || typeof r.original_filename !== 'string' || r.original_filename.length < 1 || r.original_filename.length > 240
    || !['reserved','original_verified','revoked'].includes(r.state) || r.source_classification !== 'unclassified'
    || typeof r.intake_enabled !== 'boolean' || r.processing_authorized !== false || r.customer_accepted !== false || !Number.isFinite(Date.parse(r.created_at))
    || r.verification_id !== null && !uuid.test(r.verification_id) || r.revocation_id !== null && !uuid.test(r.revocation_id)
    || (r.verification_id === null) !== (r.verified_at === null) || r.verified_at !== null && !Number.isFinite(Date.parse(r.verified_at))
    || r.state === 'original_verified' && (!r.verification_id || r.revocation_id !== null)
    || r.state === 'reserved' && (r.verification_id !== null || r.revocation_id !== null)
    || r.state === 'revoked' && !r.revocation_id) throw new IntakeError('binding_conflict', expectedJob ?? null);
  return {
    version:r.version,owner_id:r.owner_id,job_id:r.job_id,original_sha256:r.original_sha256,original_bytes:r.original_bytes,
    original_filename:r.original_filename,bucket:r.bucket,object_key:r.object_key,created_at:r.created_at,state:r.state,
    verification_id:r.verification_id,verified_at:r.verified_at,revocation_id:r.revocation_id,
    intake_enabled:r.intake_enabled,source_classification:r.source_classification,processing_authorized:false,customer_accepted:false,
  };
}
export interface OriginalTransport {
  // Implementations validate a current real user, never a caller-supplied owner field.
  currentOwner(): Promise<string>;
  readProof(owner: string, job: string): Promise<unknown>;
  // Only an explicit storage 404 is absence. Every other failure must reject.
  getObject(bucket: 'csv-uploads', key: string): Promise<Uint8Array | null>;
  // Server-owned exact path and bytes; never signed overwrite authority in a browser.
  putObject(bucket: 'csv-uploads', key: string, bytes: Uint8Array, options: { upsert: false; contentType: 'text/csv' }): Promise<void>;
  appendVerification(owner: string, job: string, sha: string, bytes: number, key: string): Promise<unknown>;
  writesEnabled(): boolean;
}
async function requireOwner(ports: Pick<OriginalTransport,'currentOwner'>, owner: string, job: string | null): Promise<void> {
  try { if (await ports.currentOwner() !== owner) throw new IntakeError('owner_changed', job); }
  catch (e) { if (e instanceof IntakeError) throw e; throw new IntakeError('owner_changed', job); }
}
export async function inspectOriginal(ports: OriginalTransport, identity: OriginalIdentity, job: string): Promise<Inspection> {
  validateIdentity(identity); if (!uuid.test(job)) throw new IntakeError('invalid_input');
  await requireOwner(ports, identity.owner, job);
  const before = readReservation(await ports.readProof(identity.owner, job), identity, job);
  if (before.state === 'revoked') throw new IntakeError('revoked', job);
  let bytes: Uint8Array | null;
  try { bytes = await ports.getObject(before.bucket, before.object_key); }
  catch { throw new IntakeError('unconfirmed', job); }
  if (bytes !== null && (!(bytes instanceof Uint8Array) || bytes.byteLength !== identity.bytes || await digestOriginal(bytes) !== identity.sha256)) throw new IntakeError('binding_conflict', job);
  await requireOwner(ports, identity.owner, job);
  const after = readReservation(await ports.readProof(identity.owner, job), identity, job);
  if (after.state === 'revoked') throw new IntakeError('revoked', job);
  if (bytes === null && after.state === 'original_verified') throw new IntakeError('binding_conflict', job);
  return { reservation: after, presence: bytes === null ? 'absent' : 'matching', originalSaved: bytes !== null, processingRequested: false };
}
export async function retainOriginal(ports: OriginalTransport, identity: OriginalIdentity, job: string, bytes: Uint8Array): Promise<Inspection> {
  if (!ports.writesEnabled()) throw new IntakeError('held', job);
  // Make one private copy so caller mutation cannot alter uploaded bytes after hashing.
  const original = bytes.slice();
  validateIdentity(identity);
  if (original.byteLength !== identity.bytes || await digestOriginal(original) !== identity.sha256) throw new IntakeError('binding_conflict', job);
  let state = await inspectOriginal(ports, identity, job);
  if (!state.reservation.intake_enabled) throw new IntakeError('held', job);
  if (state.presence === 'absent') {
    await requireOwner(ports, identity.owner, job);
    if (!ports.writesEnabled()) throw new IntakeError('held', job);
    try { await ports.putObject(state.reservation.bucket, state.reservation.object_key, original, { upsert: false, contentType: 'text/csv' }); }
    catch { throw new IntakeError('unconfirmed', job); }
    state = await inspectOriginal(ports, identity, job);
    if (!state.reservation.intake_enabled) throw new IntakeError('held', job);
    if (state.presence !== 'matching') throw new IntakeError('unconfirmed', job);
  }
  if (state.reservation.state === 'original_verified') return state;
  await requireOwner(ports, identity.owner, job);
  let receipt: Reservation;
  try {
    receipt = readReservation(await ports.appendVerification(identity.owner, job, identity.sha256, identity.bytes, state.reservation.object_key), identity, job);
  } catch (e) { if (e instanceof IntakeError) throw e; throw new IntakeError('unconfirmed', job); }
  await requireOwner(ports, identity.owner, job);
  if (receipt.state !== 'original_verified') throw new IntakeError(receipt.state === 'revoked' ? 'revoked' : 'unconfirmed', job);
  return { reservation: receipt, presence: 'matching', originalSaved: true, processingRequested: false };
}

export interface OriginalClient {
  currentOwner(): Promise<string>;
  lookup(identity: OriginalIdentity): Promise<unknown | null>;
  reserve(identity: OriginalIdentity, requestId: string, originalFilename: string): Promise<unknown>;
  inspect(identity: OriginalIdentity, job: string): Promise<Inspection>;
  retain(identity: OriginalIdentity, job: string, bytes: Uint8Array): Promise<Inspection>;
  writesEnabled(): boolean;
}
export async function recoverOriginal(ports: OriginalClient, owner: string, bytes: Uint8Array): Promise<Inspection | null> {
  const original = bytes.slice(); const identity = { owner, bytes: original.byteLength, sha256: await digestOriginal(original) };
  validateIdentity(identity); await requireOwner(ports, owner, null);
  const found = await ports.lookup(identity); await requireOwner(ports, owner, null);
  if (found === null) return null;
  const r = readReservation(found, identity);
  const result = await ports.inspect(identity, r.job_id); await requireOwner(ports, owner, r.job_id);
  readReservation(result.reservation, identity, r.job_id);
  return result;
}
export async function saveOriginal(ports: OriginalClient, owner: string, bytes: Uint8Array, filename: string, requestId: string): Promise<Inspection> {
  if (!ports.writesEnabled()) throw new IntakeError('held');
  if (!uuid.test(requestId) || typeof filename !== 'string' || filename.length < 1 || filename.length > 240 || !filename.toLowerCase().endsWith('.csv') || /[\x00-\x1f\x7f]/.test(filename)) throw new IntakeError('invalid_input');
  const original = bytes.slice(); const identity = { owner, bytes: original.byteLength, sha256: await digestOriginal(original) };
  validateIdentity(identity); await requireOwner(ports, owner, null);
  let reserved: unknown;
  // A timeout must not cause a fresh UUID or direct Storage write. A future fresh
  // browser can recover by owner+whole-byte digest, independently of this request ID.
  try { reserved = await ports.reserve(identity, requestId, filename); }
  catch { throw new IntakeError('unconfirmed'); }
  const r = readReservation(reserved, identity); await requireOwner(ports, owner, r.job_id);
  if (r.state === 'revoked') throw new IntakeError('revoked', r.job_id);
  const result = await ports.retain(identity, r.job_id, original); await requireOwner(ports, owner, r.job_id);
  const receipt = readReservation(result.reservation, identity, r.job_id);
  if (!result.originalSaved || result.presence !== 'matching' || result.processingRequested !== false || receipt.state !== 'original_verified') throw new IntakeError('unconfirmed', r.job_id);
  return result;
}

// The existing Upload Jobs list already carries the durable job ID. This read-only
// path recovers its exact proof after refresh even when the original is not reselected.
export async function recoverOriginalByJob(ports: Pick<OriginalClient,'currentOwner'|'inspect'> & { readJob(job:string):Promise<unknown> }, owner:string, job:string):Promise<Inspection> {
  if(!uuid.test(owner)||!uuid.test(job))throw new IntakeError('invalid_input');
  await requireOwner(ports,owner,job);
  const raw=await ports.readJob(job);await requireOwner(ports,owner,job);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new IntakeError('binding_conflict',job);
  const record=raw as {original_sha256:string;original_bytes:number};
  const identity={owner,sha256:record.original_sha256,bytes:record.original_bytes};
  readReservation(raw,identity,job);
  const result=await ports.inspect(identity,job);await requireOwner(ports,owner,job);
  readReservation(result.reservation,identity,job);
  if(result.processingRequested!==false||!['absent','matching'].includes(result.presence)||result.originalSaved!==(result.presence==='matching'))throw new IntakeError('binding_conflict',job);
  return result;
}
