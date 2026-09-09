import { z } from 'zod';

export const REVIEW_PAGE_SIZE = 25;
const text = z.string();
const optionalText = text.nullable();
const number = z.number().finite().nullable();
const eventSchema = z.object({
  record_key: text.regex(/^[a-f0-9]{64}$/), source_row: z.number().int().positive(),
  case_id: text, government_violation_id: text, published_violation_number: text,
  original_description: optionalText, source_status: optionalText, normalized_status: optionalText,
  violation_date: optionalText, violation_timestamp_utc: optionalText, opened_date: optionalText,
  status_changed_utc: optionalText, compliance_due_utc: optionalText,
  source_attribution: optionalText, source_notice: optionalText, review_reasons: z.array(text),
  property: z.object({ property_id: text.uuid().nullable(), source_parcel_reference: text,
    address: text, city: text, state: text, zip: text }),
  parcel_evidence: z.object({ source_scope: optionalText, source_item_id: optionalText,
    source_url: optionalText, map_title: optionalText, map_data_edited_at: optionalText,
    vintage_note: optionalText, field_notes: z.record(text),
    source_retrieved_at: optionalText, recorded_residential_units: number, recorded_year_built: number,
    recorded_lot_acres: number, latitude: number, longitude: number, limitations: z.array(text),
  }).nullable(),
});
const pageSchema = z.object({
  version: z.literal('owner-source-review-v1'), status: z.literal('available'), checked_at: text,
  batch: z.object({ preparation_sha256: text.regex(/^[a-f0-9]{64}$/), event_count: z.number().int().positive(),
    property_count: z.number().int().positive(), review_status: z.literal('pending_review'), collected_at: text,
    source_name: text, source_url: optionalText, limitations: z.array(text) }),
  events: z.array(eventSchema).max(REVIEW_PAGE_SIZE), next_offset: z.number().int().nonnegative().nullable(),
});
export type SourceReviewPage = z.infer<typeof pageSchema>;
export type SourceReviewEvent = z.infer<typeof eventSchema>;
const batchesSchema = z.object({version: z.literal('owner-source-review-batches-v1'), checked_at: text,
  batches: z.array(z.object({preparation_sha256: text.regex(/^[a-f0-9]{64}$/), collected_at: text,
    event_count: z.number().int().positive(), property_count: z.number().int().positive(),
    review_status: z.literal('pending_review')})).max(100),
  total_count: z.number().int().nonnegative(), truncated: z.boolean()});
export type SourceReviewBatches = z.infer<typeof batchesSchema>;
export type ReviewRpc = {
  rpc: (name: 'fn_owner_source_review_v1' | 'fn_owner_source_review_batches_v1', args?: { p_preparation_sha256: string; p_limit: number; p_offset: number }) => {
    abortSignal: (signal: AbortSignal) => PromiseLike<{data: unknown; error: {code?: string} | null}>;
  };
};
export class ReviewAccessError extends Error {}
export function parseReviewPage(data: unknown, batch: string, offset: number): SourceReviewPage {
  if (data && typeof data === 'object' && 'status' in data && data.status === 'unavailable')
    throw new ReviewAccessError('This account does not have review access to this batch.');
  const result = pageSchema.safeParse(data);
  if (!result.success) throw new Error('The review response could not be checked. Please refresh.');
  const page = result.data;
  const expectedCount = Math.min(REVIEW_PAGE_SIZE, Math.max(0, page.batch.event_count - offset));
  const next = offset + expectedCount < page.batch.event_count ? offset + expectedCount : null;
  if (page.batch.preparation_sha256 !== batch || page.events.length !== expectedCount || page.next_offset !== next ||
      page.batch.property_count > page.batch.event_count || new Set(page.events.map(e => e.record_key)).size !== page.events.length ||
      page.events.some((e, i) => i > 0 && e.source_row <= page.events[i - 1].source_row))
    throw new Error('The review page does not match the requested records. Please refresh.');
  return page;
}
export async function loadSourceReview(client: ReviewRpc, batch: string, offset: number, signal: AbortSignal): Promise<SourceReviewPage> {
  if (!/^[a-f0-9]{64}$/.test(batch) || !Number.isInteger(offset) || offset < 0) throw new Error('Invalid review page.');
  const {data, error} = await client.rpc('fn_owner_source_review_v1', {
    p_preparation_sha256: batch, p_limit: REVIEW_PAGE_SIZE, p_offset: offset,
  }).abortSignal(signal);
  if (error?.code === '42501' || error?.code === 'PGRST301')
    throw new ReviewAccessError('Sign in with the account approved to review this batch.');
  if (error) throw new Error('The record connection is unavailable. Please try again.');
  return parseReviewPage(data, batch, offset);
}
export async function loadSourceReviewBatches(client: ReviewRpc, signal: AbortSignal): Promise<SourceReviewBatches> {
  const {data,error} = await client.rpc('fn_owner_source_review_batches_v1').abortSignal(signal);
  if (error) throw new Error('The review connection is unavailable. Please try again.');
  const result = batchesSchema.safeParse(data);
  if (!result.success) throw new Error('The assigned batches could not be checked. Please refresh.');
  const list = result.data;
  if (list.batches.length !== Math.min(100,list.total_count) || list.truncated !== (list.total_count > 100) ||
    new Set(list.batches.map(b=>b.preparation_sha256)).size !== list.batches.length)
    throw new Error('The assigned batch list is incomplete. Please refresh.');
  return list;
}
export function sourceLink(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
