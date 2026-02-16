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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // ---- Auth: Verify the caller is authenticated ----
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: authData, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = authData.user.id;

    // Use service role client for actual operations (needs to bypass RLS)
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const { jobId } = await req.json();

    if (!jobId) {
      throw new Error('Job ID is required');
    }

    console.log(`[delete-upload-job] Deleting job: ${jobId} by user: ${userId}`);

    // 1. Get the job details including storage path
    const { data: job, error: jobError } = await supabaseClient
      .from('upload_jobs')
      .select('storage_path, user_id')
      .eq('id', jobId)
      .single();

    if (jobError) throw new Error(`Failed to fetch job: ${jobError.message}`);
    if (!job) throw new Error('Job not found');

    // ---- Authorization: Verify the user owns this job ----
    if (job.user_id !== userId) {
      // Check if user is admin
      const { data: roleData } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: you do not own this job' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2. Get all property IDs created by this job from upload_staging
    const { data: stagingRows, error: stagingError } = await supabaseClient
      .from('upload_staging')
      .select('property_id')
      .eq('job_id', jobId)
      .not('property_id', 'is', null);

    if (stagingError) {
      console.error('Error fetching staging rows:', stagingError);
    }

    const propertyIds = stagingRows?.map(row => row.property_id).filter(Boolean) || [];

    console.log(`[delete-upload-job] Found ${propertyIds.length} properties to clean up`);

    // 3. Delete violations associated with these properties
    if (propertyIds.length > 0) {
      const { error: violationsError } = await supabaseClient
        .from('violations')
        .delete()
        .in('property_id', propertyIds);

      if (violationsError) {
        console.error('Error deleting violations:', violationsError);
      } else {
        console.log(`[delete-upload-job] Deleted violations for ${propertyIds.length} properties`);
      }
    }

    // 4. Delete staging data
    const { error: deleteStagingError } = await supabaseClient
      .from('upload_staging')
      .delete()
      .eq('job_id', jobId);

    if (deleteStagingError) {
      console.error('Error deleting staging data:', deleteStagingError);
    }

    // 5. Delete the CSV file from storage
    if (job.storage_path) {
      const { error: storageError } = await supabaseClient.storage
        .from('csv-uploads')
        .remove([job.storage_path]);

      if (storageError) {
        console.error('Error deleting CSV file:', storageError);
      } else {
        console.log(`[delete-upload-job] Deleted CSV file: ${job.storage_path}`);
      }
    }

    // 6. Delete the job record
    const { error: deleteJobError } = await supabaseClient
      .from('upload_jobs')
      .delete()
      .eq('id', jobId);

    if (deleteJobError) throw new Error(`Failed to delete job: ${deleteJobError.message}`);

    console.log(`[delete-upload-job] Successfully deleted job ${jobId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[delete-upload-job] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
