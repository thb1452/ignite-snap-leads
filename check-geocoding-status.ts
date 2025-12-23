// Diagnostic script to check geocoding job status and fix issues
// Run with: deno run --allow-net --allow-env check-geocoding-status.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkGeocodingStatus() {
  console.log('🔍 Checking geocoding job status...\n');

  // Get the latest geocoding job
  const { data: latestJob, error: jobError } = await supabase
    .from('geocoding_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (jobError) {
    console.error('❌ Error fetching geocoding job:', jobError);
    return;
  }

  if (!latestJob) {
    console.log('✅ No geocoding jobs found');
    return;
  }

  console.log('📊 Latest Geocoding Job:');
  console.log(`   ID: ${latestJob.id}`);
  console.log(`   Status: ${latestJob.status}`);
  console.log(`   Created: ${latestJob.created_at}`);
  console.log(`   Total properties: ${latestJob.total_properties}`);
  console.log(`   Geocoded: ${latestJob.geocoded_count || 0}`);
  console.log(`   Failed: ${latestJob.failed_count || 0}`);
  console.log(`   Skipped: ${latestJob.skipped_count || 0}`);
  console.log(`   Error: ${latestJob.error_message || 'None'}\n`);

  // Check how many properties still need geocoding
  const { count: needsGeocodingCount, error: countError } = await supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .or('latitude.is.null,longitude.is.null');

  if (countError) {
    console.error('❌ Error counting properties:', countError);
  } else {
    console.log(`🗺️  Properties needing geocoding: ${needsGeocodingCount || 0}\n`);
  }

  // Diagnosis
  if (latestJob.status === 'failed') {
    console.log('⚠️  DIAGNOSIS: Job marked as FAILED');
    console.log('   Possible causes:');
    console.log('   1. Edge function timeout (processing too many properties)');
    console.log('   2. Memory limit exceeded (batch sizes too large)');
    console.log('   3. Mapbox API rate limiting');
    console.log('   4. Database connection error\n');

    console.log('💡 RECOMMENDED ACTIONS:');
    console.log('   1. Delete this failed job record:');
    console.log(`      DELETE FROM geocoding_jobs WHERE id = '${latestJob.id}';\n`);
    console.log('   2. Start a new geocoding job from the UI\n');
    console.log('   3. If it fails again, check Supabase logs for edge function errors\n');

    // Offer to auto-delete
    console.log('   Run with --fix flag to automatically delete failed job and reset');
  }

  if (latestJob.status === 'running' && latestJob.started_at) {
    const startedAt = new Date(latestJob.started_at);
    const now = new Date();
    const minutesRunning = (now.getTime() - startedAt.getTime()) / 1000 / 60;

    if (minutesRunning > 10) {
      console.log('⚠️  WARNING: Job has been running for', Math.round(minutesRunning), 'minutes');
      console.log('   This might indicate a stuck job. Consider marking it as failed.');
    }
  }
}

// Check if --fix flag was provided
const shouldFix = Deno.args.includes('--fix');

if (shouldFix) {
  console.log('🔧 FIX MODE: Will delete failed jobs and reset\n');

  const { error: deleteError } = await supabase
    .from('geocoding_jobs')
    .delete()
    .eq('status', 'failed');

  if (deleteError) {
    console.error('❌ Failed to delete jobs:', deleteError);
  } else {
    console.log('✅ Deleted all failed geocoding jobs');
    console.log('   You can now start a new geocoding job from the UI\n');
  }
}

await checkGeocodingStatus();

console.log('\n💡 TIP: Run with --fix flag to automatically clean up failed jobs');
