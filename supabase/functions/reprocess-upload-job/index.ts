import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { jobId } = await req.json();

    if (!jobId) {
      throw new Error('Job ID is required');
    }

    console.log(`[reprocess-upload-job] Reprocessing job: ${jobId}`);

    // 1. Get the job details
    const { data: job, error: jobError } = await supabaseClient
      .from('upload_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError) throw new Error(`Failed to fetch job: ${jobError.message}`);
    if (!job) throw new Error('Job not found');

    // 2. Check if the CSV file still exists
    const { data: fileList, error: storageError } = await supabaseClient.storage
      .from('csv-uploads')
      .list(job.storage_path.split('/')[0]);

    if (storageError) {
      throw new Error(`Failed to check file existence: ${storageError.message}`);
    }

    const fileName = job.storage_path.split('/')[1];
    const fileExists = fileList?.some(f => f.name === fileName);

    if (!fileExists) {
      throw new Error('CSV file no longer exists in storage');
    }

    // 3. Reset the job status and clear previous data
    const { error: updateError } = await supabaseClient
      .from('upload_jobs')
      .update({
        status: 'QUEUED',
        started_at: null,
        finished_at: null,
        error_message: null,
        processed_rows: 0,
        properties_created: 0,
        violations_created: 0,
        warnings: [],
      })
      .eq('id', jobId);

    if (updateError) throw new Error(`Failed to reset job: ${updateError.message}`);

    // 4. Delete existing staging data
    const { error: deleteStagingError } = await supabaseClient
      .from('upload_staging')
      .delete()
      .eq('job_id', jobId);

    if (deleteStagingError) {
      console.error('Error deleting staging data:', deleteStagingError);
    }

    // 5. Trigger the process-upload function
    const { error: invokeError } = await supabaseClient.functions.invoke('process-upload', {
      body: { jobId },
    });

    if (invokeError) {
      console.error('Error invoking process-upload:', invokeError);
      throw new Error(`Failed to trigger processing: ${invokeError.message}`);
    }

    console.log(`[reprocess-upload-job] Successfully triggered reprocessing for job ${jobId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[reprocess-upload-job] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
