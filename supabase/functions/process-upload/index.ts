import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  case_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  violation?: string;
  status?: string;
  opened_date?: string;
  last_updated?: string;
}

// Background processing function
async function processUploadJob(jobId: string) {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    console.log(`[process-upload] Starting background job ${jobId}`);

    // Get job details
    const { data: job, error: jobError } = await supabaseClient
      .from('upload_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message}`);
    }

    // Update status to PARSING
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        status: 'PARSING',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Download CSV from storage
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('csv-uploads')
      .download(job.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const csvText = await fileData.text();
    const lines = csvText.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const totalRows = lines.length - 1;
    console.log(`[process-upload] Parsed ${totalRows} rows`);

    // Update total rows
    await supabaseClient
      .from('upload_jobs')
      .update({ total_rows: totalRows })
      .eq('id', jobId);

    // Parse and insert into staging in smaller batches for better progress
    const BATCH_SIZE = 250;
    const stagingRows: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || null;
      });

      stagingRows.push({
        job_id: jobId,
        row_num: i,
        case_id: row.case_id || null,
        address: row.address || '',
        city: row.city || '',
        state: row.state || '',
        zip: row.zip || '',
        violation: row.violation || '',
        status: row.status || 'Open',
        opened_date: row.opened_date || null,
        last_updated: row.last_updated || null,
      });

      if (stagingRows.length >= BATCH_SIZE || i === lines.length - 1) {
        const { error: insertError } = await supabaseClient
          .from('upload_staging')
          .insert(stagingRows);

        if (insertError) {
          console.error('[process-upload] Staging insert error:', insertError);
          throw insertError;
        }

        // Update progress more frequently
        await supabaseClient
          .from('upload_jobs')
          .update({ 
            processed_rows: i,
            status: 'PROCESSING'
          })
          .eq('id', jobId);

        console.log(`[process-upload] Staged ${i} / ${totalRows} rows (${Math.round(i / totalRows * 100)}%)`);
        stagingRows.length = 0;
      }
    }

    // Update status to DEDUPING
    await supabaseClient
      .from('upload_jobs')
      .update({ status: 'DEDUPING' })
      .eq('id', jobId);

    console.log('[process-upload] Starting deduplication and property creation');

    // Get unique addresses from staging
    const { data: stagingData } = await supabaseClient
      .from('upload_staging')
      .select('address, city, state, zip')
      .eq('job_id', jobId);

    if (!stagingData) {
      throw new Error('No staging data found');
    }

    // Group by address
    const addressMap = new Map<string, any>();
    stagingData.forEach(row => {
      const key = `${row.address}|${row.city}|${row.state}|${row.zip}`.toLowerCase();
      if (!addressMap.has(key)) {
        addressMap.set(key, row);
      }
    });

    console.log(`[process-upload] Found ${addressMap.size} unique addresses`);

    // Check existing properties in batches
    const uniqueAddresses = Array.from(new Set(stagingData.map(r => r.address)));
    const PROP_BATCH = 1000;
    const existingMap = new Map<string, string>();

    for (let i = 0; i < uniqueAddresses.length; i += PROP_BATCH) {
      const batch = uniqueAddresses.slice(i, i + PROP_BATCH);
      const { data: existingProps } = await supabaseClient
        .from('properties')
        .select('id, address, city, state, zip')
        .in('address', batch);

      (existingProps || []).forEach(prop => {
        const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
        existingMap.set(key, prop.id);
      });
    }

    // Insert new properties in batches
    const newProperties = Array.from(addressMap.entries())
      .filter(([key]) => !existingMap.has(key))
      .map(([_, row]) => ({
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        latitude: null,
        longitude: null,
        snap_score: null,
        snap_insight: null,
      }));

    let propertiesCreated = 0;
    const PROP_INSERT_BATCH = 500;

    for (let i = 0; i < newProperties.length; i += PROP_INSERT_BATCH) {
      const batch = newProperties.slice(i, i + PROP_INSERT_BATCH);
      const { data: insertedProps, error: propsError } = await supabaseClient
        .from('properties')
        .insert(batch)
        .select('id, address, city, state, zip');

      if (propsError) {
        console.error('[process-upload] Property insert error:', propsError);
        throw propsError;
      }

      propertiesCreated += insertedProps?.length || 0;
      
      // Add to existing map
      (insertedProps || []).forEach(prop => {
        const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
        existingMap.set(key, prop.id);
      });

      console.log(`[process-upload] Created ${propertiesCreated} / ${newProperties.length} properties`);
    }

    console.log(`[process-upload] Created ${propertiesCreated} new properties`);

    // Update status to FINALIZING
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        status: 'FINALIZING',
        properties_created: propertiesCreated
      })
      .eq('id', jobId);

    // Insert violations in batches
    const { data: allStaging } = await supabaseClient
      .from('upload_staging')
      .select('*')
      .eq('job_id', jobId);

    if (!allStaging) {
      throw new Error('No staging data for violations');
    }

    const VIOL_BATCH = 500;
    const violations: any[] = [];
    let violationsCreated = 0;

    for (const row of allStaging) {
      const key = `${row.address}|${row.city}|${row.state}|${row.zip}`.toLowerCase();
      const propertyId = existingMap.get(key);

      if (!propertyId) {
        console.warn(`[process-upload] No property ID for ${key}`);
        continue;
      }

      const openedDate = row.opened_date ? new Date(row.opened_date) : null;
      const lastUpdated = row.last_updated ? new Date(row.last_updated) : null;
      const daysOpen = openedDate 
        ? Math.floor((Date.now() - openedDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      violations.push({
        property_id: propertyId,
        case_id: row.case_id,
        violation_type: row.violation,
        description: null,
        status: row.status || 'Open',
        opened_date: openedDate ? openedDate.toISOString().split('T')[0] : null,
        last_updated: lastUpdated ? lastUpdated.toISOString().split('T')[0] : null,
        days_open: daysOpen,
      });

      if (violations.length >= VIOL_BATCH) {
        const { error: violError } = await supabaseClient
          .from('violations')
          .insert(violations);

        if (violError) {
          console.error('[process-upload] Violation insert error:', violError);
          throw violError;
        }

        violationsCreated += violations.length;
        console.log(`[process-upload] Created ${violationsCreated} violations`);
        violations.length = 0;
      }
    }

    // Insert remaining
    if (violations.length > 0) {
      const { error: violError } = await supabaseClient
        .from('violations')
        .insert(violations);

      if (violError) {
        console.error('[process-upload] Violation insert error:', violError);
        throw violError;
      }

      violationsCreated += violations.length;
    }

    console.log(`[process-upload] Created ${violationsCreated} violations`);

    // Mark complete
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        status: 'COMPLETE',
        finished_at: new Date().toISOString(),
        violations_created: violationsCreated
      })
      .eq('id', jobId);

    console.log(`[process-upload] Job ${jobId} complete`);

  } catch (error) {
    console.error(`[process-upload] Job ${jobId} failed:`, error);
    
    // Update job with error
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        status: 'FAILED',
        error_message: error.message,
        finished_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Missing jobId' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[process-upload] Queuing job ${jobId}`);

    // Start background processing
    // @ts-ignore - EdgeRuntime.waitUntil is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processUploadJob(jobId));

    // Return immediately with 202 Accepted
    return new Response(
      JSON.stringify({ success: true, jobId, message: 'Processing started' }),
      { 
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[process-upload] Request error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
