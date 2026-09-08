/**
 * Server-only boundary for future customer releases. No database/network I/O.
 * Nothing here approves a collection or authenticates an HTTP caller.
 * Review decisions, committed receipts and export grants MUST be loaded by a
 * trusted server adapter, never accepted from a request body. See the contract doc.
 */
export const CUSTOMER_RELEASE_VERSION = "snap-customer-release/v1" as const;
// Existing customer client fallback; availability/auth are not changed by this contract.
export const CUSTOMER_PROJECT_REF = "ojyxblegxpdgaqiscxpz" as const;
export const MAX_RELEASE_ROWS = 50_000;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
type ObjectValue = Record<string, unknown>;

export class CustomerDeliveryError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "CustomerDeliveryError"; this.code = code; }
}
function check(ok: unknown, code: string): asserts ok {
  if (!ok) throw new CustomerDeliveryError(code);
}
function object(value: unknown): ObjectValue {
  check(value !== null && typeof value === "object" && !Array.isArray(value), "invalid_object");
  return value as ObjectValue;
}
function exact(value: unknown, keys: readonly string[]): ObjectValue {
  const result = object(value);
  check(Object.keys(result).sort().join("\0") === [...keys].sort().join("\0"), "unexpected_fields");
  return result;
}
function text(value: unknown, optional = false, max = 16_000): string {
  if (optional && (value === null || value === "")) return "";
  check(typeof value === "string" && value.trim().length > 0 && value.length <= max, "invalid_text");
  // eslint-disable-next-line no-control-regex -- Reject non-printing controls in exported source text.
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "invalid_control_character");
  return value;
}
function uuid(value: unknown): string { check(typeof value === "string" && UUID.test(value), "invalid_id"); return value; }
function hash(value: unknown): string { check(typeof value === "string" && SHA.test(value), "invalid_hash"); return value; }
function count(value: unknown, positive = false): number {
  check(Number.isSafeInteger(value) && Number(value) >= (positive ? 1 : 0) && Number(value) <= MAX_RELEASE_ROWS, "invalid_count");
  return Number(value);
}
function time(value: unknown): number {
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value), "invalid_timestamp");
  check(Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60, "invalid_timestamp");
  const result = Date.parse(value);
  check(Number.isFinite(result), "invalid_timestamp");
  date(value.slice(0, 10));
  return result;
}
function date(value: unknown, optional = false): string {
  if (optional && (value === null || value === "")) return "";
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "invalid_date");
  const parsed = new Date(value + "T00:00:00Z");
  check(Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value, "invalid_date");
  return value;
}
function https(value: unknown): string {
  const raw = text(value, false, 2048);
  let url: URL;
  try { url = new URL(raw); } catch { throw new CustomerDeliveryError("invalid_source_url"); }
  // Public citation only. Never export a signed delivery link, credentials or query tokens.
  check(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, "invalid_source_url");
  check(url.hostname.includes(".") && !/(^localhost$|\.local$|^[\d.:]+$)/i.test(url.hostname), "invalid_source_url");
  return raw;
}
function sortedJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { check(Number.isSafeInteger(value), "invalid_json_number"); return JSON.stringify(value); }
  if (Array.isArray(value)) return "[" + value.map(sortedJson).join(",") + "]";
  const row = object(value);
  return "{" + Object.keys(row).sort().map(key => JSON.stringify(key) + ":" + sortedJson(row[key])).join(",") + "}";
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function canonicalDigest(value: unknown): Promise<string> {
  return sha256(new TextEncoder().encode(sortedJson(value)));
}
function stringList(value: unknown): string[] {
  check(Array.isArray(value), "invalid_list");
  const result = value.map(item => text(item, false, 200));
  check(new Set(result).size === result.length, "duplicate_list_value");
  return result;
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().join("\0") === [...right].sort().join("\0");
}

export interface CollectionSnapshot {
  customer_project_ref: typeof CUSTOMER_PROJECT_REF;
  delivery_id: string;
  processing_run_id: string;
  jurisdiction_id: string;
  jurisdiction: string;
  state: string;
  record_type: "code_violations" | "water_shutoff";
  source_name: string;
  public_source_url: string;
  collected_at: string;
  freshness: "fresh_verified" | "historical_preserved" | "receipt_unverified";
  period_start_inclusive: string;
  period_end_exclusive: string;
  source_file_sha256: string;
  candidate_artifact_sha256: string;
  processor_version: "delivery-stage-v1.1";
  input_rows: number;
  candidate_rows: number;
  duplicate_rows: number;
  held_rows: number;
}
export interface PropertyBinding {
  customer_project_ref: typeof CUSTOMER_PROJECT_REF;
  property_id: string;
  property_revision: string;
  jurisdiction_id: string;
  address: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
}
export interface ReviewedSelection {
  record_key: string;
  source_row: number;
  canonical_sha256: string;
  property: PropertyBinding;
  acknowledged_warnings: string[];
  confidentiality: "cleared_for_customer_distribution";
}
const COLUMNS = ["property_id", "record_key", "source_row", "address", "unit", "city", "state", "zip", "case_id", "violation_id", "violation_type", "description", "source_status", "status", "opened_date", "event_date", "source_record_id", "enforcement_type", "source_name", "source_url", "jurisdiction", "collected_at", "freshness"] as const;
type CustomerColumn = typeof COLUMNS[number];
export type CustomerRow = Record<CustomerColumn, string>;
export interface ReleaseProposal {
  version: typeof CUSTOMER_RELEASE_VERSION;
  collection: CollectionSnapshot;
  selection: ReviewedSelection[];
  rows: CustomerRow[];
  sha256: string;
}

function validateCollection(input: CollectionSnapshot): void {
  exact(input, ["customer_project_ref", "delivery_id", "processing_run_id", "jurisdiction_id", "jurisdiction", "state", "record_type", "source_name", "public_source_url", "collected_at", "freshness", "period_start_inclusive", "period_end_exclusive", "source_file_sha256", "candidate_artifact_sha256", "processor_version", "input_rows", "candidate_rows", "duplicate_rows", "held_rows"]);
  check(input.customer_project_ref === CUSTOMER_PROJECT_REF, "wrong_customer_destination");
  uuid(input.delivery_id); uuid(input.processing_run_id); uuid(input.jurisdiction_id);
  text(input.jurisdiction, false, 200); text(input.source_name, false, 200); https(input.public_source_url); time(input.collected_at);
  check(/^[A-Z]{2}$/.test(input.state), "invalid_state");
  // Water is deliberately blocked until a source-specific water schema/review adapter exists.
  check(input.record_type === "code_violations" && input.processor_version === "delivery-stage-v1.1", "unsupported_record_type_or_processor");
  check(input.freshness === "fresh_verified" || input.freshness === "historical_preserved", "unverified_acquisition");
  check(date(input.period_start_inclusive) < date(input.period_end_exclusive), "invalid_period");
  hash(input.source_file_sha256); hash(input.candidate_artifact_sha256);
  check(count(input.input_rows, true) === count(input.candidate_rows, true) + count(input.duplicate_rows) + count(input.held_rows), "unreconciled_rows");
}

/** Hash-check the exact staging JSONL and project only explicitly selected, cleared rows. */
export async function prepareCustomerRelease(collection: CollectionSnapshot, artifact: Uint8Array, selected: ReviewedSelection[]): Promise<ReleaseProposal> {
  check(artifact instanceof Uint8Array && artifact.byteLength > 0 && artifact.byteLength <= MAX_ARTIFACT_BYTES, "artifact_size_limit");
  check(Array.isArray(selected) && selected.length > 0 && selected.length <= MAX_RELEASE_ROWS, "empty_or_excess_selection");
  // Snapshot caller-owned inputs before the first asynchronous hash operation.
  collection = structuredClone(collection);
  selected = structuredClone(selected);
  artifact = new Uint8Array(artifact);
  validateCollection(collection);
  check(await sha256(artifact) === collection.candidate_artifact_sha256, "artifact_hash_mismatch");
  let lines: string[];
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(artifact);
    lines = decoded.split("\n");
    if (lines.at(-1) === "") lines.pop();
  } catch { throw new CustomerDeliveryError("invalid_artifact_encoding"); }
  check(lines.length === collection.candidate_rows, "candidate_count_mismatch");
  const candidates = new Map<string, ObjectValue>();
  const sourceRows = new Set<number>();
  for (const line of lines) {
    let item: ObjectValue;
    try { item = object(JSON.parse(line)); } catch { throw new CustomerDeliveryError("invalid_candidate_json"); }
    const key = hash(item.record_key);
    const sourceRow = count(item.source_row, true);
    check(sourceRow <= collection.input_rows && !sourceRows.has(sourceRow) && !candidates.has(key), "duplicate_candidate_identity");
    check(item.source_file_sha256 === collection.source_file_sha256 && item.customer_accepted === false && item.usable_records === false, "candidate_provenance_mismatch");
    check(Array.isArray(item.reasons) && item.reasons.length === 0 && item.duplicate_of_source_row === undefined, "held_or_duplicate_candidate");
    sourceRows.add(sourceRow); candidates.set(key, item);
  }
  check(Array.isArray(selected) && selected.length > 0 && selected.length <= collection.candidate_rows, "empty_or_excess_selection");
  const seen = new Set<string>();
  const propertyLocations = new Map<string, string>();
  const rows: CustomerRow[] = [];
  for (const selection of selected) {
    exact(selection, ["record_key", "source_row", "canonical_sha256", "property", "acknowledged_warnings", "confidentiality"]);
    const item = candidates.get(hash(selection.record_key));
    check(item && !seen.has(selection.record_key) && item.source_row === selection.source_row, "invalid_selection");
    seen.add(selection.record_key);
    const canonical = object(item.canonical);
    check(await canonicalDigest(canonical) === hash(selection.canonical_sha256), "canonical_hash_mismatch");
    check(selection.confidentiality === "cleared_for_customer_distribution", "confidentiality_review_required");
    check(sameSet(stringList(item.warnings), stringList(selection.acknowledged_warnings)), "unreviewed_warnings");
    const property = selection.property;
    exact(property, ["customer_project_ref", "property_id", "property_revision", "jurisdiction_id", "address", "unit", "city", "state", "zip"]);
    check(property.customer_project_ref === collection.customer_project_ref, "wrong_customer_destination");
    uuid(property.property_id); text(property.property_revision, false, 200);
    check(uuid(property.jurisdiction_id) === collection.jurisdiction_id, "property_jurisdiction_mismatch");
    for (const field of ["address", "unit", "city", "state", "zip"] as const) {
      const value = text(canonical[field], field === "unit" || field === "zip", 500);
      check(value === property[field], "property_location_mismatch");
    }
    check(property.state === collection.state, "property_state_mismatch");
    check(property.zip === "" || /^\d{5}(?:-\d{4})?$/.test(property.zip), "invalid_zip");
    const location = sortedJson([property.jurisdiction_id, property.address, property.unit, property.city, property.state, property.zip, property.property_revision]);
    check(!propertyLocations.has(property.property_id) || propertyLocations.get(property.property_id) === location, "conflicting_property_mapping");
    propertyLocations.set(property.property_id, location);
    const eventDate = date(canonical.event_date);
    check(eventDate >= collection.period_start_inclusive && eventDate < collection.period_end_exclusive, "event_outside_period");
    const row: CustomerRow = {
      property_id: property.property_id, record_key: selection.record_key, source_row: String(selection.source_row),
      address: property.address, unit: property.unit, city: property.city, state: property.state, zip: property.zip,
      case_id: text(canonical.case_id), violation_id: text(canonical.violation_id),
      violation_type: text(canonical.violation_type), description: text(canonical.description),
      source_status: text(canonical.status), status: text(canonical.normalized_status),
      opened_date: date(canonical.opened_date, true), event_date: eventDate,
      source_record_id: text(canonical.source_record_id, true), enforcement_type: "code_violation",
      source_name: collection.source_name, source_url: collection.public_source_url,
      jurisdiction: collection.jurisdiction, collected_at: collection.collected_at, freshness: collection.freshness,
    };
    rows.push(row);
  }
  selected.sort((a, b) => a.record_key.localeCompare(b.record_key));
  rows.sort((a, b) => a.record_key.localeCompare(b.record_key));
  const content = { version: CUSTOMER_RELEASE_VERSION, collection, selection: selected, rows };
  return { ...content, sha256: await canonicalDigest(content) };
}

export const REQUIRED_RELEASE_CHECKS = ["locations", "dates", "duplicates", "missing_fields", "confidentiality", "distribution_rights", "property_mapping"] as const;
export interface ReleaseDecision {
  decision_id: string;
  reviewer_id: string;
  release_sha256: string;
  state: "approved" | "pending" | "rejected" | "revoked";
  reviewed_at: string;
  expires_at: string;
  checks: Record<typeof REQUIRED_RELEASE_CHECKS[number], boolean>;
}
export interface OriginalVerification {
  delivery_id: string;
  source_file_sha256: string;
  storage_kind: "local" | "supabase_private";
  artifact_id: string;
  verified_at: string;
}
export interface CommitPlan {
  idempotency_key: string;
  release_sha256: string;
  decision_id: string;
  delivery_id: string;
  processing_run_id: string;
  selected_records: number;
  selected_properties: number;
  original_artifact_id: string;
  state: "prepared_for_commit";
}
async function verifyProposal(proposal: ReleaseProposal): Promise<void> {
  exact(proposal, ["version", "collection", "selection", "rows", "sha256"]);
  check(proposal.version === CUSTOMER_RELEASE_VERSION, "unsupported_release_version");
  validateCollection(proposal.collection);
  const { sha256: expected, ...content } = proposal;
  check(await canonicalDigest(content) === hash(expected), "release_hash_mismatch");
  check(Array.isArray(proposal.rows) && proposal.rows.length > 0 && proposal.rows.length === proposal.selection.length && proposal.rows.length <= proposal.collection.candidate_rows, "invalid_release_rows");
  const selections = new Map(proposal.selection.map(item => [hash(item.record_key), item]));
  check(selections.size === proposal.selection.length, "duplicate_selection");
  const keys = new Set<string>();
  for (const row of proposal.rows) {
    exact(row, COLUMNS);
    COLUMNS.forEach(key => text(row[key], ["unit", "zip", "opened_date", "source_record_id"].includes(key)));
    check(!keys.has(hash(row.record_key)), "duplicate_release_row"); keys.add(row.record_key);
    uuid(row.property_id);
    check(row.enforcement_type === "code_violation", "unsupported_record_type_or_processor");
    const selection = selections.get(row.record_key);
    check(selection && selection.source_row.toString() === row.source_row && selection.property.property_id === row.property_id, "release_selection_mismatch");
    check(selection.property.customer_project_ref === CUSTOMER_PROJECT_REF && selection.property.jurisdiction_id === proposal.collection.jurisdiction_id, "wrong_customer_destination");
    for (const field of ["address", "unit", "city", "state", "zip"] as const) {
      check(selection.property[field] === row[field], "release_selection_mismatch");
    }
    check(selection.confidentiality === "cleared_for_customer_distribution", "confidentiality_review_required");
    check(row.source_name === proposal.collection.source_name && row.source_url === proposal.collection.public_source_url && row.collected_at === proposal.collection.collected_at && row.jurisdiction === proposal.collection.jurisdiction && row.freshness === proposal.collection.freshness && row.state === proposal.collection.state, "release_provenance_mismatch");
  }
}
function verifyDecision(proposal: ReleaseProposal, decision: ReleaseDecision, now: number): void {
  uuid(decision.decision_id); uuid(decision.reviewer_id);
  check(decision.state === "approved" && decision.release_sha256 === proposal.sha256, "release_not_approved");
  check(time(decision.reviewed_at) <= now && now < time(decision.expires_at), "review_expired_or_future");
  exact(decision.checks, REQUIRED_RELEASE_CHECKS);
  check(REQUIRED_RELEASE_CHECKS.every(key => decision.checks[key] === true), "incomplete_release_review");
}

/** A validation plan, never an accepted receipt. The adapter must recheck under its commit lock. */
export async function prepareAcceptanceCommit(proposal: ReleaseProposal, decision: ReleaseDecision, original: OriginalVerification, nowIso: string): Promise<CommitPlan> {
  proposal = structuredClone(proposal); decision = structuredClone(decision); original = structuredClone(original);
  const now = time(nowIso);
  await verifyProposal(proposal); verifyDecision(proposal, decision, now);
  check(time(proposal.collection.collected_at) <= now, "future_collection");
  check(original.delivery_id === proposal.collection.delivery_id && original.source_file_sha256 === proposal.collection.source_file_sha256, "original_provenance_mismatch");
  check(original.storage_kind === "supabase_private" && uuid(original.artifact_id), "durable_original_required");
  check(time(original.verified_at) <= now && now - time(original.verified_at) <= 24 * 60 * 60_000, "original_verification_stale");
  return {
    idempotency_key: "customer-release-" + proposal.sha256, release_sha256: proposal.sha256,
    decision_id: decision.decision_id, delivery_id: proposal.collection.delivery_id,
    processing_run_id: proposal.collection.processing_run_id, selected_records: proposal.rows.length,
    selected_properties: new Set(proposal.rows.map(row => row.property_id)).size,
    original_artifact_id: original.artifact_id, state: "prepared_for_commit",
  };
}

export interface AcceptedRelease {
  release_id: string;
  state: "accepted" | "revoked";
  committed_at: string;
  decision: ReleaseDecision;
  proposal: ReleaseProposal;
}
export interface ExportGrant {
  grant_id: string;
  export_request_id: string;
  customer_id: string;
  release_id: string;
  release_sha256: string;
  property_ids: string[];
  record_keys: string[];
  record_type: "code_violation";
  state: "reserved" | "revoked";
  reserved_at: string;
  expires_at: string;
  property_count: number;
  record_count: number;
}
export interface CustomerExportAuthority {
  customer_project_ref: typeof CUSTOMER_PROJECT_REF;
  /** Read from the server's accepted-release store. Raw candidate tables are not a substitute. */
  loadAcceptedRelease(releaseId: string): Promise<AcceptedRelease>;
  /** Atomically recheck live release/review, caller entitlements/unlocks and reserve usage.
   * Must bind this exact subset; idempotent retries do not charge twice. No owner-token fallback. */
  reserveExport(input: { customer_id: string; export_request_id: string; release_id: string; release_sha256: string; property_ids: string[]; record_keys: string[]; scope_sha256: string; idempotency_key: string }): Promise<ExportGrant>;
}
function csvCell(value: string): string {
  // Quote every cell. Prefix formula-like cells even after whitespace/BOM/control padding.
  const dangerous = /^[\s\p{Cf}]*[=+\-@|]/u.test(value) || /^[\t\r\n]/.test(value);
  return '"' + (dangerous ? "'" : "") + value.replaceAll('"', '""') + '"';
}

/** authenticatedCustomerId must come from the existing customer JWT, not request JSON.
 * Reuse export_request_id for retries only; the adapter rejects changed scope for the same ID. */
export async function buildCustomerExport(authenticatedCustomerId: string, request: { release_id: string; property_ids: string[]; export_request_id: string }, authority: CustomerExportAuthority, clock: () => string = () => new Date().toISOString()) {
  check(authority.customer_project_ref === CUSTOMER_PROJECT_REF, "wrong_customer_destination");
  const customerId = uuid(authenticatedCustomerId);
  exact(request, ["release_id", "property_ids", "export_request_id"]);
  const releaseId = uuid(request.release_id);
  const exportRequestId = uuid(request.export_request_id);
  const propertyIds = request.property_ids;
  check(Array.isArray(propertyIds) && propertyIds.length > 0 && propertyIds.length <= MAX_RELEASE_ROWS, "invalid_property_selection");
  const wanted = propertyIds.map(uuid).sort();
  check(new Set(wanted).size === wanted.length, "duplicate_property_selection");
  const accepted = structuredClone(await authority.loadAcceptedRelease(releaseId));
  const now = time(clock());
  check(accepted.release_id === releaseId && accepted.state === "accepted", "release_not_accepted");
  check(time(accepted.committed_at) <= now, "future_commit");
  await verifyProposal(accepted.proposal);
  verifyDecision(accepted.proposal, accepted.decision, now);
  check(time(accepted.committed_at) >= time(accepted.decision.reviewed_at), "commit_precedes_review");
  const wantedSet = new Set(wanted);
  const rows = accepted.proposal.rows.filter(row => wantedSet.has(row.property_id));
  check(sameSet([...new Set(rows.map(row => row.property_id))], wanted), "property_not_in_release");
  const recordKeys = rows.map(row => row.record_key).sort();
  const scope = { customer_id: customerId, export_request_id: exportRequestId, release_id: releaseId, release_sha256: accepted.proposal.sha256, property_ids: wanted, record_keys: recordKeys };
  const csvLines = [COLUMNS.join(",")];
  let byteCount = csvLines[0].length + 2;
  for (const row of rows) {
    const line = COLUMNS.map(key => csvCell(row[key])).join(",");
    byteCount += new TextEncoder().encode(line).byteLength + 2;
    check(byteCount <= MAX_EXPORT_BYTES, "export_size_limit");
    csvLines.push(line);
  }
  const csv = csvLines.join("\r\n") + "\r\n";
  const exportHash = await sha256(new TextEncoder().encode(csv));
  const grant = structuredClone(await authority.reserveExport({ ...scope, scope_sha256: await canonicalDigest(scope), idempotency_key: "customer-export-" + customerId + "-" + exportRequestId }));
  const grantedNow = time(clock());
  verifyDecision(accepted.proposal, accepted.decision, grantedNow);
  uuid(grant.grant_id);
  check(grant.state === "reserved" && grant.export_request_id === exportRequestId && grant.customer_id === customerId && grant.release_id === releaseId && grant.release_sha256 === accepted.proposal.sha256 && grant.record_type === "code_violation", "invalid_export_grant");
  check(sameSet(stringList(grant.property_ids), wanted) && sameSet(stringList(grant.record_keys), recordKeys), "export_grant_scope_mismatch");
  check(grant.property_count === wanted.length && grant.record_count === rows.length, "export_grant_count_mismatch");
  check(time(grant.reserved_at) <= grantedNow && grantedNow < time(grant.expires_at), "export_grant_expired_or_future");
  // Projection is fixed: no raw originals, local paths, mailboxes, reviewer IDs or storage links.
  return {
    filename: "checked-records-" + releaseId + ".csv",
    content_type: "text/csv; charset=utf-8",
    csv,
    manifest: {
      version: CUSTOMER_RELEASE_VERSION, release_id: releaseId, release_sha256: accepted.proposal.sha256,
      export_sha256: exportHash, record_count: rows.length,
      property_count: wanted.length, freshness: accepted.proposal.collection.freshness,
      collected_at: accepted.proposal.collection.collected_at,
    },
  };
}
