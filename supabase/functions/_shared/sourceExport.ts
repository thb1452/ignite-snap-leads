import { UUID, getOrCreateExportAttempt } from './exportRequest.ts';

export const SOURCE_EXPORT_FORMAT = 'source-events-v1';
export const MAX_SOURCE_EVENTS = 2000;
export const MAX_SOURCE_PROPERTIES = 1000;
const MAX_SOURCE_BYTES = 6 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
type JsonObject = Record<string, any>;
export type SourceExportRequest = { format: typeof SOURCE_EXPORT_FORMAT; acceptanceId: string };
export type SourceExportReceipt = { status: 'reserved' | 'replayed'; request_id: string;
  row_count: number; event_count: number; property_ids: string[]; rows: JsonObject[]; entitlement: JsonObject };
const object = (v: unknown): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && SHA256.test(v);
const text = (v: unknown): v is string => typeof v === 'string';
const nullableText = (v: unknown): v is string | null => v === null || text(v);
const optionalText = (v: unknown): v is string | null | undefined => v === undefined || nullableText(v);

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

// The database owns authorization and accounting. This validator refuses a
// malformed or truncated receipt instead of silently producing an incomplete CSV.
export async function validateSourceExportReceipt(data: unknown, requestId: string, acceptanceId: string): Promise<SourceExportReceipt> {
  const invalid = () => { throw Error('Source export receipt is incomplete or inconsistent.'); };
  if (!object(data) || !['reserved', 'replayed'].includes(data.status) || data.request_id !== requestId ||
      !Number.isInteger(data.row_count) || data.row_count < 1 || data.row_count > MAX_SOURCE_PROPERTIES ||
      !Number.isInteger(data.event_count) || data.event_count < 1 || data.event_count > MAX_SOURCE_EVENTS ||
      !Array.isArray(data.rows) || data.rows.length !== data.row_count ||
      !Array.isArray(data.property_ids) || data.property_ids.length !== data.row_count ||
      !data.property_ids.every(id) || new Set(data.property_ids).size !== data.row_count || !object(data.entitlement)) invalid();
  const receipt = data as SourceExportReceipt;
  const ent = receipt.entitlement;
  if (ent.acceptance_id !== acceptanceId || !hash(ent.acceptance_revision) || !hash(ent.preparation_sha256) ||
      !hash(ent.selection_sha256) || !['subscription', 'trial', 'payg'].includes(ent.mode) || ent.billing_unit !== 'property' ||
      ent.scope !== 'dated_parcel_source_snapshot' || ent.event_count !== receipt.event_count ||
      !Array.isArray(ent.mapping_ids) || ent.mapping_ids.length !== receipt.row_count ||
      !ent.mapping_ids.every(id) || new Set(ent.mapping_ids).size !== receipt.row_count ||
      new TextEncoder().encode(JSON.stringify(receipt.rows)).length > MAX_SOURCE_BYTES) invalid();
  const properties = new Set<string>(), sources = new Set<string>(), mappings = new Set<string>(), events = new Set<string>();
  let eventCount = 0;
  for (const p of receipt.rows) {
    if (!object(p) || !id(p.property_id) || !receipt.property_ids.includes(p.property_id) || properties.has(p.property_id) ||
        !id(p.source_property_id) || sources.has(p.source_property_id) || !id(p.mapping_id) || mappings.has(p.mapping_id) ||
        !ent.mapping_ids.includes(p.mapping_id) || p.acceptance_id !== acceptanceId || p.acceptance_revision !== ent.acceptance_revision ||
        !id(p.review_event_id) || p.enforcement_type !== 'code_violation' || p.scope !== ent.scope ||
        ![p.address, p.city, p.state, p.zip].every(text) || !hash(p.parcel_evidence_sha256) || !text(p.parcel_evidence_original_text) ||
        !Array.isArray(p.events) || !p.events.length) invalid();
    properties.add(p.property_id); sources.add(p.source_property_id); mappings.add(p.mapping_id);
    if (await sourceExportHash(p.parcel_evidence_original_text) !== p.parcel_evidence_sha256) invalid();
    let parcel: JsonObject;
    try { parcel = JSON.parse(p.parcel_evidence_original_text); } catch { return invalid(); }
    if (!object(parcel) || parcel.property_id !== p.source_property_id || parcel.preparation_sha256 !== ent.preparation_sha256 ||
        parcel.source_scope !== 'dated_parcel_snapshot' || !text(parcel.source_parcel_reference)) invalid();
    for (const e of p.events) {
      eventCount++;
      if (eventCount > MAX_SOURCE_EVENTS || !object(e) || !hash(e.record_key) || events.has(e.record_key) ||
          !Number.isInteger(e.source_row) || e.source_row < 1 || e.preparation_sha256 !== ent.preparation_sha256 ||
          !id(e.delivery_id) || !id(e.processing_run_id) || !hash(e.original_sha256) || !hash(e.canonical_sha256) ||
          !text(e.source_original_text) || !object(e.source_fields) || !Array.isArray(e.original_review_reasons) ||
          !e.original_review_reasons.every(text) || !Array.isArray(e.review_resolutions) ||
          !nullableText(e.case_opened_date) || e.violation_opened_date !== null || !text(e.case_opened_date_meaning) ||
          !nullableText(e.violation_date) || !nullableText(e.violation_timestamp_utc) || !nullableText(e.status_as_collected) || !text(e.collected_at)) invalid();
      events.add(e.record_key);
      const s = e.source_fields;
      if (s.record_key !== e.record_key || s.original_sha256 !== e.original_sha256 || s.canonical_sha256 !== e.canonical_sha256 ||
          s.delivery_id !== e.delivery_id || s.processing_run_id !== e.processing_run_id ||
          s.source_parcel_reference !== parcel.source_parcel_reference || s.source_original_json !== e.source_original_text ||
          !optionalText(s.opened_date) || !optionalText(s.violation_date) ||
          !optionalText(s.violation_timestamp_utc) || !optionalText(s.source_status) ||
          (s.opened_date ?? null) !== e.case_opened_date || (s.violation_date ?? null) !== e.violation_date ||
          (s.violation_timestamp_utc ?? null) !== e.violation_timestamp_utc || (s.source_status ?? null) !== e.status_as_collected ||
          s.code_collected_at !== e.collected_at ||
          ![s.original_description, s.source_attribution, s.source_notice].every(optionalText) ||
          ![s.case_id, s.published_violation_number, s.source_numeric_violation_id, s.source_object_id,
            s.code_source_url, s.terms_url].every(text) ||
          await sourceExportHash(e.source_original_text) !== e.original_sha256) invalid();
    }
  }
  if (eventCount !== receipt.event_count) invalid();
  return receipt;
}

export const SOURCE_EXPORT_COLUMNS = [
  'export_request_id', 'acceptance_id', 'acceptance_revision', 'review_event_id', 'property_id', 'source_property_id', 'mapping_id',
  'scope', 'address', 'city', 'state', 'zip', 'record_key', 'source_row', 'preparation_sha256', 'delivery_id', 'processing_run_id',
  'case_id', 'published_violation_number', 'source_numeric_violation_id', 'source_object_id', 'source_parcel_reference',
  'original_description', 'status_as_collected', 'case_opened_date', 'violation_opened_date', 'case_opened_date_meaning',
  'violation_date', 'violation_timestamp_utc', 'status_changed_utc', 'compliance_due_utc', 'collected_at', 'source_unit',
  'code_source_url', 'source_attribution', 'terms_url', 'source_notice', 'original_sha256', 'canonical_sha256',
  'parcel_evidence_sha256', 'source_original_text', 'parcel_evidence_original_text', 'source_fields_json',
  'original_review_reasons_json', 'review_resolutions_json',
] as const;
function csvCell(value: unknown): string {
  let result = String(value ?? '');
  // Defuse spreadsheet formulas including a leading whitespace prefix.
  if (/^[\s\u0000-\u001f]*[=+\-@|]/u.test(result) || /^[\t\r]/.test(result)) result = '\t' + result;
  return /[,"\r\n]/.test(result) ? '"' + result.replace(/"/g, '""') + '"' : result;
}
export function sourceExportCsv(receipt: SourceExportReceipt): string {
  const lines = [SOURCE_EXPORT_COLUMNS.join(',')];
  for (const p of receipt.rows) for (const e of p.events) {
    const s = e.source_fields;
    const row: Record<typeof SOURCE_EXPORT_COLUMNS[number], unknown> = {
      export_request_id: receipt.request_id, acceptance_id: p.acceptance_id, acceptance_revision: p.acceptance_revision,
      review_event_id: p.review_event_id, property_id: p.property_id, source_property_id: p.source_property_id, mapping_id: p.mapping_id,
      scope: p.scope, address: p.address, city: p.city, state: p.state, zip: p.zip,
      record_key: e.record_key, source_row: e.source_row, preparation_sha256: e.preparation_sha256,
      delivery_id: e.delivery_id, processing_run_id: e.processing_run_id, case_id: s.case_id,
      published_violation_number: s.published_violation_number, source_numeric_violation_id: s.source_numeric_violation_id,
      source_object_id: s.source_object_id, source_parcel_reference: s.source_parcel_reference, original_description: s.original_description,
      status_as_collected: e.status_as_collected, case_opened_date: e.case_opened_date, violation_opened_date: e.violation_opened_date,
      case_opened_date_meaning: e.case_opened_date_meaning, violation_date: e.violation_date, violation_timestamp_utc: e.violation_timestamp_utc,
      status_changed_utc: s.status_changed_utc, compliance_due_utc: s.compliance_due_utc, collected_at: e.collected_at, source_unit: s.source_unit,
      code_source_url: s.code_source_url, source_attribution: s.source_attribution, terms_url: s.terms_url, source_notice: s.source_notice,
      original_sha256: e.original_sha256, canonical_sha256: e.canonical_sha256, parcel_evidence_sha256: p.parcel_evidence_sha256,
      source_original_text: e.source_original_text, parcel_evidence_original_text: p.parcel_evidence_original_text,
      source_fields_json: JSON.stringify(s), original_review_reasons_json: JSON.stringify(e.original_review_reasons),
      review_resolutions_json: JSON.stringify(e.review_resolutions),
    };
    lines.push(SOURCE_EXPORT_COLUMNS.map(column => csvCell(row[column])).join(','));
  }
  return lines.join('\r\n');
}

type ClientDependencies = {
  userId: string; token: string; endpoint: string; storage: Pick<Storage, 'getItem' | 'setItem'>;
  locks: Pick<LockManager, 'request'>; fetch: typeof fetch;
};
export async function requestSourceDetailCsv(input: SourceExportRequest, dependencies: ClientDependencies): Promise<{
  csv: string; requestId: string; acceptanceId: string; propertyCount: number; eventCount: number;
}> {
  const request = normalizeSourceExportRequest(input);
  const { userId, token, storage, locks } = dependencies;
  if (!id(userId) || !token) throw Error('Please sign in to export data');
  if (!locks?.request) throw Error('This browser cannot safely save export attempts across tabs. Export remains held.');
  const fingerprint = await sourceExportFingerprint(request);
  const lockName = `snap-export-attempt-v1:${userId}:${fingerprint}`;
  const attempt = await locks.request(lockName, () => getOrCreateExportAttempt(storage, userId, fingerprint));
  const response = await dependencies.fetch(dependencies.endpoint, {
    method: 'POST', headers: { Accept: 'text/csv', Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'Idempotency-Key': attempt.requestId }, body: JSON.stringify(request),
  });
  if (!response.ok) {
    let error: any;
    try { error = await response.json(); } catch { /* Unconfirmed gateway failure; preserve the request identity. */ }
    if (error?.code === 'EXPORT_LIMIT_EXCEEDED') throw Error('EXPORT_LIMIT_EXCEEDED');
    if (response.status === 403) throw Error('This account is not authorized for this source export.');
    if (response.status === 409) throw Error('The saved source export needs review before retrying.');
    throw Error('Source export is unconfirmed. Retry this same reviewed selection to recover its saved receipt.');
  }
  const propertyCount = Number(response.headers.get('X-Export-Property-Count'));
  const eventCount = Number(response.headers.get('X-Export-Event-Count'));
  const digest = response.headers.get('X-Export-Content-SHA256');
  if (response.headers.get('X-Export-Request-Id') !== attempt.requestId ||
      response.headers.get('X-Export-Acceptance-Id') !== request.acceptanceId ||
      response.headers.get('X-Export-Format') !== SOURCE_EXPORT_FORMAT ||
      !response.headers.get('Content-Type')?.startsWith('text/csv') || !hash(digest) ||
      !Number.isInteger(propertyCount) || propertyCount < 1 || propertyCount > MAX_SOURCE_PROPERTIES ||
      !Number.isInteger(eventCount) || eventCount < propertyCount || eventCount > MAX_SOURCE_EVENTS) {
    throw Error('Source export receipt could not be confirmed. Retry the same reviewed selection.');
  }
  const csv = await response.text();
  if (!csv.startsWith(SOURCE_EXPORT_COLUMNS.join(',') + '\r\n') || await sourceExportHash(csv) !== digest) {
    throw Error('Source export content could not be confirmed. Retry the same reviewed selection.');
  }
  // Keep this immutable acceptance's saved identity after a successful download.
  // Downloading it again or reopening the browser reconciles the same receipt.
  return { csv, requestId: attempt.requestId, acceptanceId: request.acceptanceId, propertyCount, eventCount };
}
