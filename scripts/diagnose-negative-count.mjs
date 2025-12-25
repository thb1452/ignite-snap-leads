#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('='.repeat(70));
console.log('DIAGNOSTIC: NEGATIVE PROPERTY COUNT INVESTIGATION');
console.log('='.repeat(70));
console.log('');

// Get all recent upload jobs
const { data: jobs, error: jobsError } = await supabase
  .from('upload_jobs')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20);

if (jobsError) {
  console.error('Failed to fetch upload jobs:', jobsError);
  process.exit(1);
}

console.log(`Found ${jobs.length} recent upload jobs`);
console.log('');

// Find jobs with negative properties_created
const negativeJobs = jobs.filter(job =>
  job.properties_created !== null && job.properties_created < 0
);

if (negativeJobs.length > 0) {
  console.log(`⚠️  FOUND ${negativeJobs.length} JOBS WITH NEGATIVE PROPERTY COUNTS:`);
  console.log('');

  for (const job of negativeJobs) {
    console.log(`Job ID: ${job.id}`);
    console.log(`  Status: ${job.status}`);
    console.log(`  Created: ${job.created_at}`);
    console.log(`  Total Rows: ${job.total_rows}`);
    console.log(`  Properties Created: ${job.properties_created} ❌ NEGATIVE!`);
    console.log(`  Violations Created: ${job.violations_created}`);
    console.log(`  City: ${job.city}, State: ${job.state}`);
    console.log(`  Error: ${job.error_message || 'none'}`);
    console.log('');

    // Check staging data for this job
    const { count: stagingCount } = await supabase
      .from('upload_staging')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id);

    console.log(`  Staging rows: ${stagingCount}`);

    // Check properties created by this job
    const { count: propCount } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('city', job.city)
      .eq('state', job.state);

    console.log(`  Properties in ${job.city}, ${job.state}: ${propCount}`);
    console.log('');
  }
} else {
  console.log('✓ No jobs with negative property counts found');
  console.log('');
}

// Show all recent jobs for reference
console.log('RECENT UPLOAD JOBS (last 10):');
console.log('');

for (const job of jobs.slice(0, 10)) {
  const status = job.status === 'COMPLETE' ? '✓' :
                 job.status === 'FAILED' ? '✗' :
                 '⟳';

  const props = job.properties_created || 0;
  const viols = job.violations_created || 0;
  const rows = job.total_rows || 0;

  console.log(`${status} ${job.id.slice(0, 8)}... | ${job.status.padEnd(12)} | Rows: ${rows.toString().padStart(6)} | Props: ${props.toString().padStart(6)} | Viols: ${viols.toString().padStart(6)} | ${job.city}, ${job.state}`);
}

console.log('');
console.log('='.repeat(70));
