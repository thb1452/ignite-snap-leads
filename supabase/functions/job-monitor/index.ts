import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Thresholds for detecting stuck jobs
const UPLOAD_STUCK_THRESHOLD_SECONDS = 180;  // 3 minutes without progress = stuck
const GEOCODING_STUCK_THRESHOLD_SECONDS = 300;  // 5 minutes without progress = stuck

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const results = {
      uploadJobsReset: 0,
      geocodingJobsReset: 0,
      errors: [] as string[],
    };

    // 1. Find stuck upload jobs (in progress but no update for threshold time)
    const { data: stuckUploadJobs, error: uploadError } = await supabaseClient
      .from('upload_jobs')
      .select('id, status, updated_at, user_id')
      .in('status', ['PARSING', 'PROCESSING', 'DEDUPING', 'CREATING_VIOLATIONS', 'FINALIZING'])
      .lt('updated_at', new Date(Date.now() - UPLOAD_STUCK_THRESHOLD_SECONDS * 1000).toISOString());

    if (uploadError) {
      results.errors.push(`Upload jobs query error: ${uploadError.message}`);
    } else if (stuckUploadJobs && stuckUploadJobs.length > 0) {
      console.log(`[job-monitor] Found ${stuckUploadJobs.length} stuck upload jobs`);
      
      for (const job of stuckUploadJobs) {
        // Reset to QUEUED so it gets reprocessed
        const { error: resetError } = await supabaseClient
          .from('upload_jobs')
          .update({ 
            status: 'QUEUED', 
            started_at: null,
            error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id);

        if (resetError) {
          results.errors.push(`Failed to reset upload job ${job.id}: ${resetError.message}`);
        } else {
          results.uploadJobsReset++;
          console.log(`[job-monitor] Reset stuck upload job ${job.id} (was ${job.status})`);
          
          // Trigger reprocessing
          try {
            const processUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-upload`;
            await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ jobId: job.id }),
            });
          } catch (e) {
            console.error(`[job-monitor] Failed to trigger process-upload for ${job.id}:`, e);
          }
        }
      }
    }

    // 2. Find stuck geocoding jobs
    const { data: stuckGeoJobs, error: geoError } = await supabaseClient
      .from('geocoding_jobs')
      .select('id, status, created_at, user_id')
      .in('status', ['queued', 'running'])
      .lt('created_at', new Date(Date.now() - GEOCODING_STUCK_THRESHOLD_SECONDS * 1000).toISOString());

    if (geoError) {
      results.errors.push(`Geocoding jobs query error: ${geoError.message}`);
    } else if (stuckGeoJobs && stuckGeoJobs.length > 0) {
      console.log(`[job-monitor] Found ${stuckGeoJobs.length} stuck geocoding jobs`);
      
      for (const job of stuckGeoJobs) {
        // Mark as failed - geocoding will be triggered again on next upload
        const { error: resetError } = await supabaseClient
          .from('geocoding_jobs')
          .update({ 
            status: 'failed',
            error_message: 'Auto-cancelled: job appeared stuck',
            finished_at: new Date().toISOString()
          })
          .eq('id', job.id);

        if (resetError) {
          results.errors.push(`Failed to reset geocoding job ${job.id}: ${resetError.message}`);
        } else {
          results.geocodingJobsReset++;
          console.log(`[job-monitor] Cancelled stuck geocoding job ${job.id}`);
        }
      }
    }

    // 3. Clean up orphaned QUEUED jobs that are very old (> 1 hour)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { data: orphanedJobs } = await supabaseClient
      .from('upload_jobs')
      .select('id')
      .eq('status', 'QUEUED')
      .lt('created_at', oneHourAgo)
      .is('started_at', null);

    if (orphanedJobs && orphanedJobs.length > 0) {
      console.log(`[job-monitor] Found ${orphanedJobs.length} orphaned QUEUED jobs, triggering processing...`);
      
      for (const job of orphanedJobs) {
        try {
          const processUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-upload`;
          await fetch(processUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jobId: job.id }),
          });
        } catch (e) {
          console.error(`[job-monitor] Failed to trigger orphaned job ${job.id}:`, e);
        }
      }
    }

    console.log(`[job-monitor] Complete: ${results.uploadJobsReset} upload jobs reset, ${results.geocodingJobsReset} geocoding jobs reset`);

    return new Response(JSON.stringify({
      success: true,
      ...results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[job-monitor] Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
