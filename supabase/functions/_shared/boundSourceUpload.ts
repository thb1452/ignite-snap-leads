import { projectBoundSourceUpload, type SourceBinding, SourceSemanticsError } from './municipalSourceSemantics.ts';

// This table is operator-written; never accept this binding from an HTTP body,
// CSV header, filename, job.source_type, or uploaded JSON.
export async function readSourceBinding(client: any, jobId: string): Promise<SourceBinding | null> {
  const { data, error } = await client.from('upload_source_bindings')
    .select('job_id,source_key,source_event_id,input_sha256,collected_at')
    .eq('job_id', jobId).maybeSingle();
  if (error) throw new SourceSemanticsError('source_binding_read_failed');
  return data;
}

export class SourceReviewUnconfirmedError extends Error {}

export async function stageBoundSourceUpload(client: any, jobId: string, file: Blob, binding: SourceBinding) {
  if (binding.job_id !== jobId) throw new SourceSemanticsError('source_job_binding_mismatch');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const projection = await projectBoundSourceUpload(bytes, binding);
  try {
  const { data, error } = await client.rpc('stage_bound_source_upload_v1', {
    p_job_id: jobId, p_original_text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    p_projection: projection,
  });
  if (error) throw new SourceSemanticsError('source_review_staging_unconfirmed');
  if (!data || !['review_staged', 'review_replayed'].includes(data.status) ||
      data.source_rows !== projection.source_rows || data.customer_accepted !== false || data.usable_records !== false)
    throw new SourceSemanticsError('source_review_receipt_invalid');
  return data;
  } catch {
    // A transport failure can follow a committed transaction. Do not terminally fail
    // the job: its atomic DB status is authoritative, and PARSING can replay later.
    throw new SourceReviewUnconfirmedError('source_review_staging_unconfirmed');
  }
}
