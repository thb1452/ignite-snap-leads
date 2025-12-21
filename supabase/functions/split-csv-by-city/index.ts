import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { parse, stringify } from "https://deno.land/std@0.168.0/encoding/csv.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Sanitize filename for Supabase Storage compliance
 * Removes/replaces characters that cause "Invalid key" errors
 */
function sanitizeFilename(filename: string): string {
  // Preserve file extension
  const lastDotIndex = filename.lastIndexOf('.');
  const name = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
  const ext = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

  const sanitized = name
    .replace(/["']/g, '')           // Remove quotes
    .replace(/[()[\]{}]/g, '')      // Remove brackets/parens
    .replace(/\s+/g, '_')           // Spaces → underscores
    .replace(/[<>:|?*]/g, '-')      // Invalid path chars → hyphens
    .replace(/\./g, '_')            // Replace remaining dots in name
    .replace(/_{2,}/g, '_')         // Collapse multiple underscores
    .replace(/^[._-]+|[._-]+$/g, ''); // Trim leading/trailing special chars

  return sanitized + ext;
}

/**
 * Split a multi-city CSV into separate per-city upload jobs
 * CRITICAL: Uses object-first approach - NO index-based slicing
 */
serve(async (req: Request) => {
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
      return new Response(
        JSON.stringify({ error: 'Missing jobId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[split-csv] Starting multi-city split for job ${jobId}`);

    // 1. Get the upload job
    const { data: job, error: jobError } = await supabaseClient
      .from('upload_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message}`);
    }

    // 2. Download the CSV file
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('csv-uploads')
      .download(job.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const csvText = await fileData.text();

    // 3. Parse CSV into row objects (STEP 1: PARSE ONCE)
    console.log(`[split-csv] Parsing CSV...`);
    const parsedData = parse(csvText, {
      skipFirstRow: false,
      strip: true,
    }) as string[][];

    if (parsedData.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = parsedData[0].map(h => h.trim().toLowerCase());
    const dataRows = parsedData.slice(1);

    console.log(`[split-csv] Parsed ${dataRows.length} data rows with headers: ${headers.join(', ')}`);

    // Find city column index
    const cityIndex = headers.findIndex(h =>
      h === 'city' || h === 'municipality' || h.includes('city')
    );
    const stateIndex = headers.findIndex(h =>
      h === 'state' || h === 'st'
    );

    if (cityIndex === -1) {
      throw new Error('No city column found in CSV');
    }

    // 4. Group row objects by city (STEP 2: GROUP BY CITY)
    console.log(`[split-csv] Grouping rows by city...`);
    const rowsByCity = new Map<string, string[][]>();

    dataRows.forEach(row => {
      const city = (row[cityIndex] || '').trim().toLowerCase();
      const state = stateIndex >= 0 ? (row[stateIndex] || '').trim() : job.state || '';

      if (!city) {
        console.warn(`[split-csv] Skipping row with missing city: ${row.join('|')}`);
        return;
      }

      const key = `${city}|${state}`;

      if (!rowsByCity.has(key)) {
        rowsByCity.set(key, []);
      }

      rowsByCity.get(key)!.push(row);
    });

    console.log(`[split-csv] Detected ${rowsByCity.size} unique cities`);

    // 5. Create a new upload job for each city (STEP 3: SERIALIZE & CREATE JOBS)
    const createdJobs: string[] = [];

    for (const [cityKey, rows] of rowsByCity.entries()) {
      const [city, state] = cityKey.split('|');

      console.log(`[split-csv] Creating job for ${city}, ${state}: ${rows.length} rows`);

      // STEP 4: SERIALIZE NEW CSV - OBJECT-FIRST APPROACH
      // NO index-based slicing - we have the actual row objects
      const newCsvData = [headers, ...rows];
      const newCsvText = stringify(newCsvData);

      // Upload the split CSV file with sanitized city/state names
      const splitFileName = `${sanitizeFilename(city)}_${sanitizeFilename(state)}_split_${Date.now()}.csv`;
      const splitPath = `${job.user_id}/splits/${splitFileName}`;

      console.log(`[split-csv] Sanitized filename: "${city}_${state}" → "${splitFileName}"`);

      const { error: uploadError } = await supabaseClient.storage
        .from('csv-uploads')
        .upload(splitPath, new Blob([newCsvText], { type: 'text/csv' }));

      if (uploadError) {
        if (uploadError.message.includes('Invalid key')) {
          console.error(`[split-csv] Invalid storage key for ${city}, ${state}: "${splitFileName}"`, uploadError);
          console.error(`[split-csv] This should not happen with sanitization. Original city: "${city}"`);
        } else {
          console.error(`[split-csv] Failed to upload split file for ${city}:`, uploadError);
        }
        continue;
      }

      // Create new upload job for this city
      const { data: newJob, error: jobError } = await supabaseClient
        .from('upload_jobs')
        .insert({
          user_id: job.user_id,
          storage_path: splitPath,
          filename: splitFileName,
          file_size: newCsvText.length,
          status: 'QUEUED',
          city: city,
          state: state,
          county: job.county || null,
          parent_job_id: jobId, // Track that this came from a split
        })
        .select('id')
        .single();

      if (jobError) {
        console.error(`[split-csv] Failed to create job for ${city}:`, jobError);
        continue;
      }

      createdJobs.push(newJob.id);

      console.log(`[split-csv] ✓ Created job ${newJob.id} for ${city}, ${state} (${rows.length} rows)`);

      // Trigger processing for this city's job
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ jobId: newJob.id }),
      });
    }

    // Mark parent job as complete
    await supabaseClient
      .from('upload_jobs')
      .update({
        status: 'COMPLETE',
        finished_at: new Date().toISOString(),
        properties_created: 0, // Parent job doesn't create properties
        violations_created: 0,
      })
      .eq('id', jobId);

    console.log(`[split-csv] ===== SPLIT SUMMARY =====`);
    console.log(`[split-csv] Original rows: ${dataRows.length}`);
    console.log(`[split-csv] Cities detected: ${rowsByCity.size}`);
    console.log(`[split-csv] Jobs created: ${createdJobs.length}`);
    console.log(`[split-csv] ===========================`);

    return new Response(
      JSON.stringify({
        success: true,
        citiesDetected: rowsByCity.size,
        jobsCreated: createdJobs.length,
        jobs: createdJobs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[split-csv] Error:', error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
