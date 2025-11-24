import { supabase } from '@/integrations/supabase/client';
import { callFn } from '@/integrations/http/functions';

export async function deleteUploadJob(jobId: string) {
  const { data, error } = await supabase.functions.invoke('delete-upload-job', {
    body: { jobId },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function reprocessUploadJob(jobId: string) {
  const { data, error } = await supabase.functions.invoke('reprocess-upload-job', {
    body: { jobId },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function cleanupDeletedJobs() {
  // Get all upload jobs
  const { data: jobs, error: jobsError } = await supabase
    .from('upload_jobs')
    .select('id, storage_path');

  if (jobsError) throw jobsError;
  if (!jobs) return { deleted: 0 };

  let deletedCount = 0;

  // Check each job's CSV file
  for (const job of jobs) {
    try {
      const userFolder = job.storage_path.split('/')[0];
      const fileName = job.storage_path.split('/')[1];

      const { data: fileList, error: storageError } = await supabase.storage
        .from('csv-uploads')
        .list(userFolder);

      if (storageError) {
        console.error(`Error checking storage for job ${job.id}:`, storageError);
        continue;
      }

      const fileExists = fileList?.some(f => f.name === fileName);

      if (!fileExists) {
        // CSV has been deleted, remove the job
        await deleteUploadJob(job.id);
        deletedCount++;
        console.log(`Cleaned up job ${job.id} - CSV file no longer exists`);
      }
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
    }
  }

  return { deleted: deletedCount };
}
