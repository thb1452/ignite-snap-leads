import { z } from 'zod';

export const BUFFALO_REVIEW_PAGE_SIZE = 25;
export const BUFFALO_SOURCE_URL = 'https://data.buffalony.gov/resource/ivrf-k9vm.json';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().min(1);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
const eventSchema = z.object({
  agency_record_id: nonempty, case_number: nonempty, case_type: z.string(),
  violation_code: z.string(), code_section: z.string(), violation_description: z.string(),
  comments: z.string(), violation_location: z.string(), violation_date: calendarDate,
  source_date_raw: nonempty, source_status: z.literal('ACTIVE'), normalized_status: z.literal('active'),
  address: nonempty, city: z.literal('BUFFALO'), state: z.literal('NY'), zip: z.string().regex(/^\d{5}$/),
  property_class: z.enum(['200', '210', '215', '220', '230', '240', '250', '260', '270', '271', '280', '281']),
  residential_evidence: nonempty, parcel_id: z.string(), source_content_hash: hash,
  source_row_number: z.number().int().positive(),
}).strict();
const availableSchema = z.object({
  version: z.literal('owner-buffalo-source-review-v1'), status: z.literal('available'),
  checked_at: z.string().datetime({ offset: true }),
  batch: z.object({
    preparation_sha256: hash, source_name: nonempty, source_url: z.literal(BUFFALO_SOURCE_URL),
    collected_at: z.string().datetime({ offset: true }), event_count: z.number().int().positive(),
    case_count: z.number().int().positive(), address_count: z.number().int().positive(),
    held_count: z.number().int().nonnegative(), limitations: z.array(z.string()),
  }).strict(),
  events: z.array(eventSchema).max(BUFFALO_REVIEW_PAGE_SIZE),
  next_offset: z.number().int().nonnegative().nullable(),
}).strict();
const unavailableSchema = z.object({
  version: z.literal('owner-buffalo-source-review-v1'), status: z.literal('unavailable'),
}).strict();

export type BuffaloSourceReview = z.infer<typeof availableSchema>;
export type BuffaloReviewResult = BuffaloSourceReview | z.infer<typeof unavailableSchema>;
export type BuffaloReviewRpc = {
  rpc: (name: 'fn_owner_buffalo_source_review_v1', args: {p_limit: number; p_offset: number}) => {
    abortSignal: (signal: AbortSignal) => PromiseLike<{data: unknown; error: {code?: string} | null}>;
  };
};

/** A dedicated source contract: never treat a Buffalo violation date as its case opening. */
export function parseBuffaloSourceReview(data: unknown, offset: number): BuffaloReviewResult {
  if (!Number.isInteger(offset) || offset < 0 || offset % BUFFALO_REVIEW_PAGE_SIZE !== 0)
    throw new Error('Invalid Buffalo review page.');
  const unavailable = unavailableSchema.safeParse(data);
  if (unavailable.success) return unavailable.data;
  const parsed = availableSchema.safeParse(data);
  if (!parsed.success) throw new Error('The Buffalo records could not be checked. Please refresh.');
  const page = parsed.data;
  const expectedCount = Math.min(BUFFALO_REVIEW_PAGE_SIZE, Math.max(0, page.batch.event_count - offset));
  const next = offset + expectedCount < page.batch.event_count ? offset + expectedCount : null;
  if (!expectedCount || page.events.length !== expectedCount || page.next_offset !== next ||
      page.batch.case_count > page.batch.event_count || page.batch.address_count > page.batch.case_count ||
      new Set(page.events.map(event => event.agency_record_id)).size !== page.events.length ||
      page.events.some((event, index) => index > 0 && event.source_row_number <= page.events[index - 1].source_row_number) ||
      page.events.some(event => event.source_date_raw.slice(0, 10) !== event.violation_date))
    throw new Error('The Buffalo page does not match its source records. Please refresh.');
  return page;
}

export async function loadBuffaloSourceReview(client: BuffaloReviewRpc, offset: number, signal: AbortSignal): Promise<BuffaloReviewResult> {
  if (!Number.isInteger(offset) || offset < 0 || offset % BUFFALO_REVIEW_PAGE_SIZE !== 0)
    throw new Error('Invalid Buffalo review page.');
  const {data, error} = await client.rpc('fn_owner_buffalo_source_review_v1', {
    p_limit: BUFFALO_REVIEW_PAGE_SIZE, p_offset: offset,
  }).abortSignal(signal);
  if (error?.code === '42501' || error?.code === 'PGRST301')
    throw new Error('Sign in with the account assigned to review the Buffalo batch.');
  if (error) throw new Error('The Buffalo record connection is unavailable. Please try again.');
  return parseBuffaloSourceReview(data, offset);
}

export function buffaloCalendarDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
  });
}
