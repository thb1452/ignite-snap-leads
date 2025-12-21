import { supabase } from '@/integrations/supabase/client';
import { callFn } from '@/integrations/http/functions';
import { sanitizeFilename } from '@/utils/sanitizeFilename';

interface CreateJobParams {
  file: File;
  userId: string;
  city: string;
  county: string | null;
  state: string;
}

export async function createUploadJob({ file, userId, city, county, state }: CreateJobParams): Promise<string> {
  // 1. Upload file to storage with sanitized filename
  const timestamp = Date.now();
  const sanitizedName = sanitizeFilename(file.name);
  const storagePath = `${userId}/${timestamp}-${sanitizedName}`;

  console.log(`[uploadJobs] Uploading file: "${file.name}" → "${sanitizedName}"`);

  const { error: uploadError } = await supabase.storage
    .from('csv-uploads')
    .upload(storagePath, file);

  if (uploadError) {
    // Check if it's a filename issue
    if (uploadError.message.includes('Invalid key')) {
      throw new Error(
        `Filename contains invalid characters. Please rename your file and try again. ` +
        `Original name: "${file.name}"`
      );
    }
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }

  // 2. Create job record
  const { data: job, error: jobError } = await supabase
    .from('upload_jobs')
    .insert({
      user_id: userId,
      storage_path: storagePath,
      filename: file.name,
      file_size: file.size,
      status: 'QUEUED',
      city,
      county,
      state,
    })
    .select('id')
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to create job: ${jobError?.message}`);
  }

  // 3. Trigger processing edge function
  console.log('[uploadJobs] Invoking process-upload function for job:', job.id);
  try {
    const result = await callFn('process-upload', { jobId: job.id });
    console.log('[uploadJobs] process-upload function invoked successfully:', result);
  } catch (error) {
    console.error('[uploadJobs] Failed to trigger processing:', error);
    // Mark job as failed if we can't even invoke the function
    await supabase
      .from('upload_jobs')
      .update({
        status: 'FAILED',
        error_message: `Failed to start processing: ${error instanceof Error ? error.message : 'Unknown error'}`,
        finished_at: new Date().toISOString()
      })
      .eq('id', job.id);
    throw error;
  }

  return job.id;
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
