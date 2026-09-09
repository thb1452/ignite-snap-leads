import type { SupabaseClient } from '@supabase/supabase-js';

export const UPLOAD_REVIEW_PAGE_SIZE = 25;

export type UploadReviewRow = {
  id: string;
  job_id: string;
  row_num: number;
  address: string;
  city: string | null;
  violation: string;
  status: string | null;
  processed: boolean | null;
  error: string | null;
  source_semantics?: unknown;
};

export type UploadReviewPage = { rows: UploadReviewRow[]; total: number; offset: number };

export async function readUploadReviewPage(
  client: Pick<SupabaseClient, 'from'>,
  jobId: string,
  offset: number,
  signal?: AbortSignal,
): Promise<UploadReviewPage> {
  if (!jobId || !Number.isSafeInteger(offset) || offset < 0 || offset % UPLOAD_REVIEW_PAGE_SIZE !== 0) {
    throw new Error('Invalid review page');
  }
  // The existing authenticated client and server RLS authorize this job's rows.
  // row_num is not unique, so the primary key is a required stable tie-breaker.
  let query = client.from('upload_staging').select('*', { count: 'exact' })
    .eq('job_id', jobId)
    .order('row_num', { ascending: true }).order('id', { ascending: true })
    .range(offset, offset + UPLOAD_REVIEW_PAGE_SIZE - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, error, count } = await query;
  if (error) throw error;
  if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(data)) {
    throw new Error('Review row count unavailable');
  }
  const rows = data as UploadReviewRow[];
  const expected = Math.min(UPLOAD_REVIEW_PAGE_SIZE, Math.max(0, count - offset));
  if (rows.length !== expected || rows.some(row => !row || typeof row.id !== 'string' || row.job_id !== jobId
        || !Number.isSafeInteger(row.row_num))
      || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('Review page could not be reconciled');
  }
  return { rows, total: count, offset };
}
