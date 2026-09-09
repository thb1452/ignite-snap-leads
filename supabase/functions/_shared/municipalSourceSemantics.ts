/** Source-specific projection at the existing upload boundary; no provider or DB calls. */
export const SOURCE_SEMANTICS_VERSION = 'municipal-source-semantics-v1';
export const SOURCE_KEYS = ['syracuse_code_violations_v2', 'chicago_22u3_xenr'] as const;
export type SourceKey = typeof SOURCE_KEYS[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectRow = Record<string, Json>;
export type SourceBinding = {
  job_id: string; source_key: SourceKey; source_event_id: string;
  input_sha256: string; collected_at: string;
};
export class SourceSemanticsError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
function requireValue(ok: unknown, code: string): asserts ok {
  if (!ok) throw new SourceSemanticsError(code);
}
function object(value: unknown): ObjectRow {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'source_row_must_be_object');
  return value as ObjectRow;
}
function text(value: Json | undefined, required = false): string | null {
  requireValue(value == null || typeof value === 'string', 'source_text_type_changed');
  if (required) requireValue(typeof value === 'string' && value.trim().length > 0, 'required_source_text_missing');
  return value == null ? null : value as string;
}
function numericId(value: Json | undefined): string {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'source_numeric_id_changed');
  return String(value); // Documented Syracuse numeric identifier; original numeric value remains in raw_source.
}
function epoch(value: Json | undefined, meaning: string) {
  requireValue(value == null || (typeof value === 'number' && Number.isSafeInteger(value)), 'source_epoch_type_changed');
  const date = value == null ? null : new Date(value as number);
  requireValue(!date || Number.isFinite(date.getTime()), 'source_epoch_invalid');
  return { meaning, raw: value ?? null, iso_utc: date?.toISOString() ?? null,
    calendar_date: date?.toISOString().slice(0, 10) ?? null, precision: 'millisecond', timezone: 'UTC' };
}
function civil(value: Json | undefined, meaning: string) {
  const raw = text(value);
  if (raw != null && raw !== '') {
    requireValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(raw), 'source_civil_date_changed');
    const date = new Date(raw + 'Z');
    requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === raw.slice(0, 19), 'source_civil_date_invalid');
  }
  return { meaning, raw, iso_utc: null, calendar_date: raw ? raw.slice(0, 10) : null,
    precision: 'offset_free_calendar_timestamp', timezone: null };
}
const SOURCES = {
  syracuse_code_violations_v2: {
    namespace: 'city-of-syracuse-ny/Code_Violations_V2', city: 'Syracuse', state: 'NY',
    url: 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer/0',
  },
  chicago_22u3_xenr: {
    namespace: 'us-il-chicago-department-of-buildings/22u3-xenr', city: 'Chicago', state: 'IL',
    url: 'https://data.cityofchicago.org/resource/22u3-xenr.json',
  },
} as const;
export type SourceSemantics = ReturnType<typeof projectSourceRow>['source_semantics'];

export function projectSourceRow(input: unknown, binding: SourceBinding, sourceRow: number) {
  requireValue(SOURCE_KEYS.includes(binding.source_key), 'unbound_source_adapter');
  requireValue(Number.isInteger(sourceRow) && sourceRow > 0 && sourceRow <= 2000, 'source_row_bound');
  const original = object(input), raw = object(original.raw_government_attributes);
  if ('collection_id' in original) requireValue(original.collection_id === binding.source_event_id, 'source_acquisition_identity_mismatch');
  if ('collected_at' in original) requireValue(typeof original.collected_at === 'string' &&
    Date.parse(original.collected_at) === Date.parse(binding.collected_at), 'source_collection_time_mismatch');
  const source = SOURCES[binding.source_key], chicago = binding.source_key === 'chicago_22u3_xenr';
  // Input is the full collected record, not the lossy nine-column compatibility export.
  const recordId = chicago ? text(raw.id, true)! : numericId(raw.ObjectId);
  const violationId = chicago ? recordId : numericId(raw.violation_id);
  const caseId = chicago ? null : text(raw.complaint_number);
  const publishedNumber = chicago ? null : text(raw.violation_number);
  const inspection = chicago ? text(raw.inspection_number, true) : null;
  const propertyReference = chicago ? text(raw.property_group, true) : text(raw.SBL, true);
  const rawType = chicago ? text(raw.violation_code, true)! : text(raw.violation, true)!;
  const description = chicago ? text(raw.violation_description) : text(raw.violation);
  const sourceStatus = chicago ? text(raw.violation_status) : text(raw.status_type_name);
  const mapping: Record<string, string> = chicago
    ? { OPEN: 'open', COMPLIED: 'complied', 'NO ENTRY': 'no_entry' }
    : { Open: 'open', Closed: 'closed', Void: 'void' };
  const normalizedStatus = sourceStatus == null ? null : mapping[sourceStatus] ?? null;
  const address = chicago ? text(raw.address, true)! : text(raw.complaint_address, true)!;
  // Syracuse dictionary explicitly declares complaint_zip an integer.
  // Stringify that documented representation; never restore imagined leading zeros.
  const zip = chicago || raw.complaint_zip == null ? null : numericId(raw.complaint_zip);
  const dates = chicago ? {
    citation: civil(raw.violation_date, 'citation_date'),
    case_opened: null, violation_opened: null,
    status_changed: civil(raw.violation_status_date, 'source_violation_status_date'),
    source_modified: civil(raw.violation_last_modified_date, 'source_record_modified_date'),
    compliance_due: null,
  } : {
    citation: epoch(raw.violation_date, 'citation_date'),
    case_opened: epoch(raw.open_date, 'case_opening_date'), violation_opened: null,
    status_changed: epoch(raw.status_date, 'source_violation_status_date'),
    source_modified: null,
    compliance_due: epoch(raw.comply_by_date, 'compliance_due_date'),
  };
  requireValue(dates.citation.calendar_date !== null, 'citation_date_missing');
  const holds = ['customer_acceptance_missing', 'customer_property_mapping_missing',
    'distribution_review_pending', 'current_condition_unverified', 'residential_scope_unverified',
    'common_category_mapping_unreviewed', 'violation_opening_date_unavailable'];
  if (normalizedStatus == null) holds.push('source_status_unmapped');
  if (chicago) holds.push('case_identifier_not_supplied', 'tax_parcel_identity_unverified');
  else if (caseId == null || caseId === '') holds.push('case_identifier_missing_in_row');
  const namespacedType = `${source.namespace}::${rawType}`;
  const semantics = {
    version: SOURCE_SEMANTICS_VERSION, source_key: binding.source_key, source_namespace: source.namespace,
    source_event_id: binding.source_event_id, source_url: source.url, collected_at: binding.collected_at,
    source_row: sourceRow, record_grain: 'source_violation',
    identifiers: { source_record_id: recordId, government_violation_id: violationId,
      published_violation_number: publishedNumber, case_id: caseId, case_identifier_available: !chicago,
      inspection_number: inspection, property_reference: propertyReference,
      property_reference_kind: chicago ? 'source_address_group' : 'source_parcel_sbl' },
    violation_type: { namespace: source.namespace, original_value: rawType,
      value_kind: chicago ? 'source_code' : 'source_description', namespaced_value: namespacedType,
      source_description: description, common_category: null },
    text: { description, inspector_comments: chicago ? text(raw.violation_inspector_comments) : null,
      ordinance: chicago ? text(raw.violation_ordinance) : null,
      violation_location: chicago ? text(raw.violation_location) : null },
    status: { original: sourceStatus, normalized: normalizedStatus, meaning: 'source_violation_status_at_collection',
      inspection_status: chicago ? text(raw.inspection_status) : null, current_condition_proven: false },
    dates,
    location: { address, city: source.city, state: source.state, zip, unit: null },
    raw_source: structuredClone(raw), original_input: structuredClone(original),
    review_state: 'pending_review', customer_accepted: false, usable_records: false,
    insight_eligibility: { source_snapshot_description: true, current_enforcement_score: false,
      violation_days_open: false, shared_category_comparison: false, residential_distress: false },
    holds,
  };
  return { source_row: sourceRow, source_record_id: recordId, case_id: caseId, address,
    city: source.city, state: source.state, zip, violation: namespacedType, status: sourceStatus,
    opened_date: null, last_updated: null, raw_description: description, source_semantics: semantics };
}

export async function projectBoundSourceUpload(rawBytes: Uint8Array, binding: SourceBinding) {
  requireValue(rawBytes.byteLength > 0 && rawBytes.byteLength <= 8 * 1024 * 1024, 'rich_source_input_size');
  requireValue(/^[a-f0-9]{64}$/.test(binding.input_sha256), 'source_pin_missing');
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', rawBytes as BufferSource))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  requireValue(digest === binding.input_sha256, 'source_input_hash_mismatch');
  requireValue(/^[a-f0-9-]{36}$/.test(binding.job_id) && typeof binding.source_event_id === 'string' &&
    binding.source_event_id.length > 0 && binding.source_event_id.length <= 200, 'source_binding_invalid');
  requireValue(typeof binding.collected_at === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(binding.collected_at) &&
    Number.isFinite(Date.parse(binding.collected_at)), 'collection_time_unbound');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
  const input = JSON.parse(text);
  requireValue(Array.isArray(input) && input.length > 0 && input.length <= 2000, 'rich_source_row_bound');
  const rows = input.map((row, index) => projectSourceRow(row, binding, index + 1));
  requireValue(new Set(rows.map(r => r.source_record_id)).size === rows.length, 'duplicate_source_record_id');
  requireValue(new Set(rows.map(r => r.source_semantics.identifiers.government_violation_id)).size === rows.length,
    'duplicate_government_violation_id');
  return { version: SOURCE_SEMANTICS_VERSION, job_id: binding.job_id, input_sha256: digest,
    source_key: binding.source_key, source_event_id: binding.source_event_id, collected_at: binding.collected_at,
    rows, source_rows: rows.length, review_state: 'pending_review',
    customer_accepted: false, usable_records: false, public_violation_writes: 0, insight_calls: 0 };
}

/** No unreviewed source namespace may silently enter the legacy keyword/scoring engine. */
export function requiresSourceSemanticReview(violation: { violation_type?: unknown; source_semantics?: unknown }): boolean {
  const type = violation.violation_type;
  const namespace = typeof type === 'string' &&
    Object.values(SOURCES).some(source => type.startsWith(source.namespace + '::'));
  return Boolean(namespace || (violation.source_semantics != null &&
    object(violation.source_semantics).source_key !== 'legacy_unknown'));
}
export function legacySourceMeaning() {
  return { source_key: 'legacy_unknown', source_namespace: null, field_meanings_verified: false } as const;
}
