import { UUID } from './exportRequest.ts';

export const SOURCE_EXPORT_FORMAT = 'source-events-v1';
export const MAX_SOURCE_EVENTS = 2000;
export const MAX_SOURCE_PROPERTIES = 1000;
type JsonObject = Record<string, any>;
export type SourceExportRequest = { format: typeof SOURCE_EXPORT_FORMAT; acceptanceId: string };
export type SourceExportReceipt = { status: 'reserved' | 'replayed'; request_id: string;
  row_count: number; event_count: number; property_ids: string[]; rows: JsonObject[]; entitlement: JsonObject };
const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function normalizeSourceExportRequest(input: Record<string, unknown>): SourceExportRequest {
  if (Object.keys(input).length !== 2 || input.format !== SOURCE_EXPORT_FORMAT || !id(input.acceptanceId)) {
    throw Error('Source exports require the supported format and one reviewed acceptance.');
  }
  return { format: SOURCE_EXPORT_FORMAT, acceptanceId: input.acceptanceId.toLowerCase() };
}
export async function sourceExportHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function sourceExportFingerprint(request: SourceExportRequest): Promise<string> {
  return sourceExportHash(JSON.stringify(request));
}

// Historical source snapshots have no reviewed privacy contract. They remain
// private owner evidence, never ordinary exports or a fallback for cleaned data.
export const SOURCE_EXPORT_PRIVACY_HELD = 'Source export is paused until its records have verified privacy cleaning.';
export async function validateSourceExportReceipt(_data: unknown, _requestId: string, _acceptanceId: string): Promise<SourceExportReceipt> {
  throw Error(SOURCE_EXPORT_PRIVACY_HELD);
}
export const SOURCE_EXPORT_COLUMNS = ['export_request_id','property_id','address','city','state','zip','record_key','cleaned_description'] as const;
export function sourceExportCsv(_receipt: SourceExportReceipt): string { throw Error(SOURCE_EXPORT_PRIVACY_HELD); }

type ClientDependencies = {
  userId: string; token: string; endpoint: string; storage: Pick<Storage, 'getItem' | 'setItem'>;
  locks: Pick<LockManager, 'request'>; fetch: typeof fetch;
};
export async function requestSourceDetailCsv(input: SourceExportRequest, dependencies: ClientDependencies): Promise<{
  csv: string; requestId: string; acceptanceId: string; propertyCount: number; eventCount: number;
}> {
  normalizeSourceExportRequest(input);
  // Stop before allocating an attempt or touching quota/wallet accounting.
  throw Error(SOURCE_EXPORT_PRIVACY_HELD);
}
