import { UUID, getOrCreateExportAttempt } from './exportRequest.ts';
import { cleanedInvestorCsv, parseAcceptedCleanEvidence } from './cleanInvestorEvidence.ts';

export const SOURCE_EXPORT_FORMAT = 'source-events-v1';
export const MAX_SOURCE_EVENTS = 2000;
export const MAX_SOURCE_PROPERTIES = 1000;
export type SourceExportRequest = { format: typeof SOURCE_EXPORT_FORMAT; acceptanceId: string };
export type SourceExportReceipt = {
  status: 'reserved' | 'replayed'; request_id: string; row_count: number; event_count: number;
  property_ids: string[];
  rows: Array<{ property_id: string; source_property_id: string; events: unknown[] }>;
  entitlement: Record<string, unknown>;
};
const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

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

/** Fail closed unless every exported row is an accepted, hashed clean event. */
export async function validateSourceExportReceipt(data: unknown, requestId: string, acceptanceId: string): Promise<SourceExportReceipt> {
  const receipt = data as Partial<SourceExportReceipt> | null;
  if (!receipt || !['reserved','replayed'].includes(receipt.status ?? '') || receipt.request_id !== requestId ||
    !Number.isInteger(receipt.row_count) || receipt.row_count! < 1 || receipt.row_count! > MAX_SOURCE_PROPERTIES ||
    !Number.isInteger(receipt.event_count) || receipt.event_count! < 1 || receipt.event_count! > MAX_SOURCE_EVENTS ||
    !Array.isArray(receipt.property_ids) || receipt.property_ids.length !== receipt.row_count ||
    !receipt.property_ids.every(id) || new Set(receipt.property_ids).size !== receipt.row_count ||
    !Array.isArray(receipt.rows) || receipt.rows.length !== receipt.row_count ||
    !receipt.entitlement || typeof receipt.entitlement !== 'object' ||
    receipt.entitlement.acceptance_id !== acceptanceId || !hash(receipt.entitlement.acceptance_revision) ||
    typeof receipt.entitlement.export_as_of !== 'string' ||
    !Number.isFinite(Date.parse(receipt.entitlement.export_as_of)) ||
    Date.parse(receipt.entitlement.export_as_of)>Date.now())
    throw Error('The cleaned export receipt did not reconcile.');
  const groups = receipt.rows as SourceExportReceipt['rows'];
  if (groups.some(group => !group || typeof group !== 'object' ||
    Object.keys(group).sort().join('|') !== 'events|property_id|source_property_id' ||
    !id(group.property_id) || !id(group.source_property_id) ||
    !Array.isArray(group.events) || !group.events.length) ||
    groups.reduce((sum, group) => sum + group.events.length, 0) !== receipt.event_count ||
    groups.some((group, index) => group.property_id !== receipt.property_ids![index]))
    throw Error('The cleaned property groups did not reconcile.');
  const events = groups.flatMap(group => group.events);
  const evidence = await parseAcceptedCleanEvidence({
    version:'accepted-clean-investor-evidence-v1', acceptance_id:acceptanceId,
    acceptance_revision:receipt.entitlement.acceptance_revision,
    as_of:receipt.entitlement.export_as_of, events,
  });
  if (new Set(evidence.events.map(e => e.property_id)).size !== receipt.row_count ||
    groups.some(group => group.events.some(event =>
      (event as {property_id?:string}).property_id !== group.source_property_id)))
    throw Error('The exported property count did not reconcile.');
  return receipt as SourceExportReceipt;
}
export async function sourceExportCsv(receipt: SourceExportReceipt): Promise<string> {
  const groups = receipt.rows;
  const rows = groups.flatMap(group => group.events);
  const base = await cleanedInvestorCsv({
    version:'accepted-clean-investor-evidence-v1',
    acceptance_id:receipt.entitlement.acceptance_id,
    acceptance_revision:receipt.entitlement.acceptance_revision,
    as_of:receipt.entitlement.export_as_of, events:rows,
  });
  const lines = base.split('\r\n');
  const mapping = groups.flatMap(group => group.events.map(() => group.property_id));
  if (lines.length !== mapping.length + 1) throw Error('The cleaned CSV did not reconcile.');
  return ['customer_property_id,' + lines[0], ...mapping.map((id, index) => '"' + id + '",' + lines[index + 1])].join('\r\n');
}

type ClientDependencies = {
  userId: string; token: string; endpoint: string; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  locks: Pick<LockManager, 'request'>; fetch: typeof fetch;
};
export async function requestSourceDetailCsv(input: SourceExportRequest, dependencies: ClientDependencies): Promise<{
  csv: string; requestId: string; acceptanceId: string; propertyCount: number; eventCount: number;
}> {
  const request = normalizeSourceExportRequest(input);
  if (!id(dependencies.userId) || !dependencies.token || !dependencies.endpoint.startsWith('https://') ||
      !dependencies.locks?.request) throw Error('Sign in with an export-enabled account.');
  const fingerprint = await sourceExportFingerprint(request);
  const attempt = getOrCreateExportAttempt(dependencies.storage, dependencies.userId, fingerprint);
  return dependencies.locks.request(attempt.key, async () => {
    const response = await dependencies.fetch(dependencies.endpoint, {
      method:'POST',
      headers:{ Accept:'text/csv', Authorization:`Bearer ${dependencies.token}`,
        'Content-Type':'application/json', 'Idempotency-Key':attempt.requestId },
      body:JSON.stringify(request),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as { code?: string };
      if (response.status === 403) throw Error('This account does not have a current accepted export allowance.');
      if (response.status === 409) throw Error('The saved export request conflicts with its prior receipt.');
      throw Error(errorBody.code === 'SOURCE_PRIVACY_REVIEW_REQUIRED'
        ? 'Source export is still waiting for privacy approval.'
        : 'The cleaned export is unconfirmed. Retry this selection to reconcile the saved attempt.');
    }
    const csv = await response.text();
    const claimedHash = response.headers.get('X-Export-Content-SHA256');
    const count = Number(response.headers.get('X-Export-Property-Count'));
    const eventCount = Number(response.headers.get('X-Export-Event-Count'));
    if (response.headers.get('X-Export-Format') !== SOURCE_EXPORT_FORMAT ||
      response.headers.get('X-Export-Request-Id') !== attempt.requestId ||
      response.headers.get('X-Export-Acceptance-Id') !== request.acceptanceId ||
      !hash(claimedHash) || await sourceExportHash(csv) !== claimedHash ||
      !Number.isInteger(count) || count < 1 || count > MAX_SOURCE_PROPERTIES ||
      !Number.isInteger(eventCount) || eventCount < count || eventCount > MAX_SOURCE_EVENTS ||
      csv.split('\r\n').length !== eventCount + 1)
      throw Error('The cleaned export response did not reconcile. Retry the same saved attempt.');
    // Keep this accepted selection's request ID so repeat downloads replay
    // the saved server receipt rather than charging the account again.
    return { csv, requestId:attempt.requestId, acceptanceId:request.acceptanceId,
      propertyCount:count, eventCount };
  });
}
