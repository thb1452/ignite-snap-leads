import { supabase } from '@/integrations/supabase/client';
import { callFn } from '@/integrations/http/functions';

interface CreateJobParams {
  file: File;
  userId: string;
}

export async function createUploadJob({ file, userId }: CreateJobParams): Promise<string> {
  // 1. Upload file to storage
  const timestamp = Date.now();
  const storagePath = `${userId}/${timestamp}-${file.name}`;
  
  const { error: uploadError } = await supabase.storage
    .from('csv-uploads')
    .upload(storagePath, file);

  if (uploadError) {
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
    })
    .select('id')
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to create job: ${jobError?.message}`);
  }

  // 3. Trigger processing edge function (fire and forget)
  callFn('process-upload', { jobId: job.id }).catch(error => {
    console.error('Failed to trigger processing:', error);
  });

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
