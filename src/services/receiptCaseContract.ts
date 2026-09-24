import { z } from 'zod';

export const RECEIPT_CASE_LIMITATIONS = [
  'Case summaries are not individual violation findings or proof of current conditions.',
  'Dated, reviewed subset; omitted cases and later changes are not represented.',
  'Refresh cadence has not been verified.',
] as const;

const text = z.string().min(1).refine(value => value.trim().length > 0);
const uuid = z.string().uuid();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().safe();

function isCalendarDay(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const day = z.string().refine(isCalendarDay);
const timestamp = z.string().refine(value => {
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  return !!match && isCalendarDay(match[1]) && Number.isFinite(Date.parse(value));
});

const citationSchema = z.object({
  agency_key: text,
  request_id: uuid,
  receipt_id: uuid,
  source_job_id: uuid,
  archive_id: uuid,
  archive_manifest_sha256: sha,
  original_sha256: sha,
  source_row_sha256: sha,
  source_rows: z.tuple([count.positive(), count.positive()]).refine(rows => rows[0] < rows[1]),
  report_date: day,
}).strict();

const caseSchema = z.object({
  record_kind: z.literal('case'),
  record_key: sha,
  version_id: sha,
  case_id: text,
  category: text,
  // An empty status means that the agency supplied no status.
  status: z.string(),
  filed_date: day,
  closed_date: day.nullable(),
  cleaned_description: text,
  cleaned_sha256: sha,
  cleaning_rule_version: text,
  citation: citationSchema,
}).strict();

const detailSchema = z.object({
  version: z.literal('receipt-case-crm-detail-v1'),
  lead_id: uuid,
  property: z.object({id: uuid, address: text, city: text, state: text}).strict(),
  snapshot: z.object({
    snapshot_id: uuid,
    acceptance_id: uuid,
    valid_until: timestamp,
    evidence_kind: z.enum(['original_backed', 'synthetic']),
    report_date: day,
    received_at: timestamp,
    original_count: count.positive(),
    reviewed_count: count.positive(),
    held_count: count,
    coverage: z.literal('reviewed_subset'),
    freshness: z.literal('dated_snapshot'),
    cadence: z.literal('unverified'),
  }).strict(),
  cases: z.array(caseSchema).min(1).max(1000),
  limitations: z.array(text).min(RECEIPT_CASE_LIMITATIONS.length),
}).strict();

export type ReceiptCaseDetail = z.infer<typeof detailSchema>;
export type ReceiptCase = ReceiptCaseDetail['cases'][number];

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function snapshotCitation(citation: ReceiptCase['citation']): string {
  return JSON.stringify([
    citation.agency_key, citation.request_id, citation.receipt_id, citation.source_job_id,
    citation.archive_id, citation.archive_manifest_sha256, citation.original_sha256,
  ]);
}

/** Checks the response contract and evidence consistency, not customer authorization. */
export async function parseReceiptCaseDetail(value: unknown): Promise<ReceiptCaseDetail> {
  const parsed = detailSchema.safeParse(value);
  const invalid = () => new Error('Receipt case detail could not be verified.');
  if (!parsed.success) throw invalid();
  const detail = parsed.data;
  const {snapshot, cases} = detail;
  if (snapshot.original_count - snapshot.reviewed_count !== snapshot.held_count ||
      cases.length > snapshot.reviewed_count ||
      new Set(cases.map(row => row.record_key)).size !== cases.length ||
      new Set(cases.map(row => row.version_id)).size !== cases.length ||
      !RECEIPT_CASE_LIMITATIONS.every(limitation => detail.limitations.includes(limitation))) {
    throw invalid();
  }

  const expectedCitation = snapshotCitation(cases[0].citation);
  for (const row of cases) {
    if (row.filed_date > snapshot.report_date ||
        row.closed_date !== null && (row.closed_date < row.filed_date || row.closed_date > snapshot.report_date) ||
        row.citation.report_date !== snapshot.report_date ||
        snapshotCitation(row.citation) !== expectedCitation) throw invalid();
  }

  const valid = await Promise.all(cases.map(async row => {
    const [descriptionHash, recordKey, versionId] = await Promise.all([
      sha256(JSON.stringify(row.cleaned_description)),
      sha256(JSON.stringify([row.citation.agency_key, 'case', row.case_id])),
      sha256(row.record_key + row.citation.original_sha256 + row.citation.source_row_sha256 + row.cleaning_rule_version),
    ]);
    return descriptionHash === row.cleaned_sha256 && recordKey === row.record_key && versionId === row.version_id;
  }));
  if (valid.some(result => !result)) throw invalid();
  return detail;
}
