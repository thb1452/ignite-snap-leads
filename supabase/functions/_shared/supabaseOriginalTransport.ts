import { IntakeError, productionOriginalIntakeEnabled, type OriginalTransport } from './originalIntake.ts';

// Structural adapter for the existing supabase-js client. No second storage system,
// replacement auth, key loading, signed upload tokens or background worker is added.
type Reply<T> = { data: T | null; error: unknown };
export interface ExistingOwnerClient {
  auth: { getUser(): Promise<{ data: { user: unknown }; error: unknown }> };
}
export interface ExistingServiceClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Reply<unknown>>;
  storage: { from(bucket: string): {
    download(key: string): Promise<Reply<Blob>>;
    upload(key: string, body: Uint8Array, options: { upsert: false; contentType: 'text/csv' }): Promise<Reply<{ path: string }>>;
  } };
}
export function createOriginalTransport(ownerClient: ExistingOwnerClient, serviceClient: ExistingServiceClient,
  reviewedWriteGate: () => boolean = productionOriginalIntakeEnabled): OriginalTransport {
  const rpc = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await serviceClient.rpc(name, args);
    if (result.error || !result.data) throw new IntakeError('unconfirmed');
    return result.data;
  };
  return {
    writesEnabled: reviewedWriteGate,
    currentOwner: async () => {
      const result = await ownerClient.auth.getUser();
      const u = result.data?.user as Record<string, unknown> | null;
      const banned = u?.banned_until == null ? 0 : Date.parse(String(u.banned_until));
      if (result.error || !u || typeof u.id !== 'string' || u.is_anonymous === true || u.deleted_at || u.disabled || u.is_disabled
        || !u.email_confirmed_at && !u.phone_confirmed_at || !Number.isFinite(banned) || banned > Date.now()) throw new IntakeError('owner_changed');
      return u.id;
    },
    readProof: (owner, job) => rpc('fn_original_intake_transport_read_v1', { p_owner: owner, p_job: job }),
    getObject: async (bucket, key) => {
      const result = await serviceClient.storage.from(bucket).download(key);
      if (result.error) {
        const e = result.error as { name?: unknown; status?: unknown; statusCode?: unknown };
        // Exact structured missing-object response only. Auth, timeout, quota and
        // malformed responses are uncertainty, never permission to upload again.
        if (e.name === 'StorageApiError' && (e.status === 400 || e.status === 404) && e.statusCode === '404') return null;
        throw new IntakeError('unconfirmed');
      }
      if (!(result.data instanceof Blob) || result.data.size < 1 || result.data.size > 15728640) throw new IntakeError('binding_conflict');
      return new Uint8Array(await result.data.arrayBuffer());
    },
    putObject: async (bucket, key, bytes, options) => {
      if (!reviewedWriteGate()) throw new IntakeError('held');
      if (options.upsert !== false || options.contentType !== 'text/csv') throw new IntakeError('binding_conflict');
      const result = await serviceClient.storage.from(bucket).upload(key, bytes, { upsert: false, contentType: 'text/csv' });
      if (result.error || result.data?.path !== key) throw new IntakeError('unconfirmed');
    },
    appendVerification: (owner, job, sha, bytes, key) => {
      if (!reviewedWriteGate()) throw new IntakeError('held');
      return rpc('fn_verify_original_intake_v1', { p_owner: owner, p_job: job, p_sha256: sha, p_bytes: bytes, p_object_key: key });
    },
  };
}
