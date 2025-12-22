// Script to clean up corrupted upload batch from 2025-12-21
// Run this with: deno run --allow-net --allow-env cleanup-corrupted-batch.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanupCorruptedBatch() {
  console.log('🔍 Finding corrupted upload jobs...');

  // Find all jobs created in the corrupted batch (around 2025-12-21 19:45-20:00)
  const { data: jobs, error: jobsError } = await supabase
    .from('upload_jobs')
    .select('id, city, state, created_at')
    .gt('created_at', '2025-12-21 19:45:00')
    .lt('created_at', '2025-12-21 20:00:00')
    .order('created_at', { ascending: false });

  if (jobsError) {
    console.error('❌ Error fetching jobs:', jobsError);
    return;
  }

  console.log(`\n📊 Found ${jobs?.length || 0} jobs in time range:`);
  jobs?.forEach((job, i) => {
    console.log(`   ${i + 1}. ${job.id.substring(0, 8)}... | city: "${job.city}" | state: "${job.state}"`);
  });

  if (!jobs || jobs.length === 0) {
    console.log('✅ No corrupted jobs found');
    return;
  }

  console.log(`\n🗑️  Deleting ${jobs.length} corrupted jobs...`);

  let deletedCount = 0;
  let errorCount = 0;

  for (const job of jobs) {
    try {
      // Call the delete-upload-job edge function for each job
      const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-upload-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ jobId: job.id }),
      });

      if (response.ok) {
        deletedCount++;
        console.log(`   ✓ Deleted job ${job.id.substring(0, 8)}... (city: "${job.city}")`);
      } else {
        const error = await response.text();
        errorCount++;
        console.error(`   ✗ Failed to delete ${job.id.substring(0, 8)}...: ${error}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      errorCount++;
      console.error(`   ✗ Error deleting ${job.id.substring(0, 8)}...:`, error);
    }
  }

  console.log(`\n📈 Summary:`);
  console.log(`   ✓ Deleted: ${deletedCount} jobs`);
  console.log(`   ✗ Failed: ${errorCount} jobs`);

  // Verify cleanup - check for remaining garbage properties
  const { data: garbageProps, error: propsError } = await supabase
    .from('properties')
    .select('id, city, state')
    .in('city', ['stored', 'WEEDS', 'State Police', 'debris', '1.', '3.', '4.', 'integrity'])
    .limit(10);

  if (propsError) {
    console.error('⚠️  Could not verify cleanup:', propsError);
  } else if (garbageProps && garbageProps.length > 0) {
    console.log(`\n⚠️  Warning: Found ${garbageProps.length} remaining garbage properties:`);
    garbageProps.forEach(prop => {
      console.log(`   • ${prop.id.substring(0, 8)}... | city: "${prop.city}" | state: "${prop.state}"`);
    });
  } else {
    console.log(`\n✅ Cleanup complete! No garbage properties remaining.`);
  }
}

// Run cleanup
cleanupCorruptedBatch().catch(console.error);
