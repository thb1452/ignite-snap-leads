import { supabase } from '@/integrations/supabase/externalClient';
import { sanitizeFilename } from '@/utils/sanitizeFilename';


async function requireCurrentOwner(expected: string): Promise<void> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || user.id !== expected || user.is_anonymous === true || !user.email_confirmed_at && !user.phone_confirmed_at) throw new Error();
    const current = user as unknown as Record<string, unknown>;
    if (current.deleted_at != null || current.disabled === true || current.is_disabled === true || current.banned_until != null && (!Number.isFinite(Date.parse(String(current.banned_until))) || Date.parse(String(current.banned_until)) > Date.now())) throw new Error();
  } catch {
    throw new Error('Your signed-in account could not be confirmed. No processing was requested. Check your saved uploads before trying again.');
  }
}

export function newOriginalIntakeHeld(): boolean { return true; }
export class UploadIntakeHeldError extends Error {
  constructor() { super('New original intake is paused. Nothing was saved and no job was created.'); this.name = 'UploadIntakeHeldError'; }
}

export class UploadIntakeValidationError extends Error {}

export class UploadIntakeUnconfirmedError extends Error {
  constructor(readonly proposedJobId: string, readonly actorUserId: string) {
    super('The original file or job may already be saved. Check the saved job reference before retrying. No processing was requested.');
    this.name = 'UploadIntakeUnconfirmedError';
  }
}

interface CreateJobParams {
  file: File;
  userId: string;
  city: string | null;  // Can be null for county-scope uploads
  county: string | null;
  state: string;
  scope?: 'city' | 'county';
  isWaterData?: boolean;  // Flag for water disconnection data
}

export async function createUploadJob({ file, userId }: CreateJobParams): Promise<string> {
  // No Auth, storage, job creation or retry is permitted without a reviewed durable intake receipt.
  if (newOriginalIntakeHeld()) throw new UploadIntakeHeldError();
  await requireCurrentOwner(userId);
  if (!(file instanceof File) || file.size < 1 || file.size > 15 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.csv')) throw new UploadIntakeValidationError('Choose one complete CSV file up to 15 MB. The file was not saved.');
  if (file.type && !['text/csv', 'application/vnd.ms-excel'].includes(file.type) || /^[\s\uFEFF]*[\[{]/.test(await file.text())) {
    throw new UploadIntakeValidationError('This format is held. The original was not relabeled or saved. Use the reviewed source intake for non-CSV files.');
  }
  // 1. Upload file to storage with sanitized filename
  const proposedJobId = crypto.randomUUID();
  const sanitizedName = sanitizeFilename(file.name);
  const storagePath = `${userId}/${proposedJobId}-${sanitizedName}`;


  try {
  const { error: uploadError } = await supabase.storage
    .from('csv-uploads')
    .upload(storagePath, file);

  if (uploadError) {
    throw new Error('File save could not be confirmed. Check Upload Jobs before trying again. No processing was requested.');
  }

  await requireCurrentOwner(userId);

  // 2. Bind one pending job to this complete original. No source identity is invented.
  const { data: job, error: jobError } = await supabase
    .from('upload_jobs')
    .insert({
      id: proposedJobId,
      user_id: userId,
      storage_path: storagePath,
      filename: file.name,
      file_size: file.size,
      status: 'QUEUED',
      // Original intake carries no verified geography, source type or water status.
      city: null, county: null, state: null, scope: null, source_type: null,
      warnings: ['Original file retained only. Source classification and processing remain held.'],
    })
    .select('id,user_id,storage_path')
    .single();

  if (jobError || !job || job.id !== proposedJobId || job.user_id !== userId || job.storage_path !== storagePath) {
    throw new Error('The file was saved, but its job receipt is unconfirmed. Check Upload Jobs before trying again. No processing was requested.');
  }

  // Intake is separate from permission to process. Never invoke the legacy worker,
  // and never erase this saved job after a denied or unconfirmed start.
  await requireCurrentOwner(userId);

  return job.id;
  } catch {
    throw new UploadIntakeUnconfirmedError(proposedJobId, userId);
  }
}

export async function getUploadJob(jobId: string) {
  const { data, error } = await supabase
    .from('upload_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch job: ${error.message}`);
  }

  return data;
}
