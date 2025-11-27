import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { parse } from "https://deno.land/std@0.168.0/encoding/csv.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CSVRow {
  case_id?: string;
  file_number?: string;  // "File #"
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  type?: string;  // "Type" column
  violation?: string;
  status?: string;
  open_date?: string;  // "Open Date"
  close_date?: string;  // "Close Date"
  opened_date?: string;
  last_updated?: string;
  description?: string;  // "Description" column
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

    if (!job.city || !job.state) {
      throw new Error('Job missing required location information (city, state)');
    }

    console.log(`[process-upload] Using location: ${job.city}, ${job.county || 'N/A'}, ${job.state}`);

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
    
    // Use proper CSV parser to handle quoted fields with commas
    const parsedData = parse(csvText, {
      skipFirstRow: false,
      strip: true,
    }) as string[][];
    
    if (parsedData.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = parsedData[0].map(h => h.trim().toLowerCase());
    const dataRows = parsedData.slice(1);
    const totalRows = dataRows.length;
    
    console.log(`[process-upload] Parsed ${totalRows} rows from CSV`);

    // Update total rows
    await supabaseClient
      .from('upload_jobs')
      .update({ total_rows: totalRows })
      .eq('id', jobId);

    // Parse and insert into staging in smaller batches for better progress
    const BATCH_SIZE = 250;
    const stagingRows: any[] = [];
    
    for (let i = 0; i < dataRows.length; i++) {
      const values = dataRows[i];
      const row: any = {};
      
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim() || null;
      });

      // Flexible column mapping - support multiple CSV formats
      const caseId = row.case_id || row['file #'] || row.file_number || null;
      const violationType = row.category || row.violation || row.type || row.violation_type || '';
      const openDate = row.opened_date || row.open_date || row['open date'] || null;
      const closeDate = row.close_date || row['close date'] || null;
      const description = row.description || row.violation_description || null;
      
      stagingRows.push({
        job_id: jobId,
        row_num: i + 1,
        case_id: caseId,
        address: row.address || '',
        city: row.city || job.city,
        state: row.state || job.state,
        zip: row.zip || '',
        violation: violationType,
        status: row.status || 'Open',
        opened_date: openDate,
        last_updated: closeDate || row.last_updated || null,
        jurisdiction_id: job.jurisdiction_id || null,
      });

      if (stagingRows.length >= BATCH_SIZE || i === dataRows.length - 1) {
        const { error: insertError } = await supabaseClient
          .from('upload_staging')
          .insert(stagingRows);

        if (insertError) {
          console.error('[process-upload] Staging insert error:', insertError);
          throw insertError;
        }

        // Update progress more frequently
        const processedCount = i + 1;
        await supabaseClient
          .from('upload_jobs')
          .update({ 
            processed_rows: processedCount,
            status: 'PROCESSING'
          })
          .eq('id', jobId);

        console.log(`[process-upload] Staged ${processedCount} / ${totalRows} rows (${Math.round(processedCount / totalRows * 100)}%)`);
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
      .select('address, city, state, zip, jurisdiction_id')
      .eq('job_id', jobId);

    if (!stagingData) {
      throw new Error('No staging data found');
    }

    // Group by address (normalize empty strings to consistent format)
    const addressMap = new Map<string, any>();
    stagingData.forEach(row => {
      const addr = row.address?.trim() || '';
      const city = row.city?.trim() || job.city;
      const state = row.state?.trim() || job.state;
      const zip = row.zip?.trim() || '';
      const key = `${addr}|${city}|${state}|${zip}`.toLowerCase();
      if (!addressMap.has(key)) {
        addressMap.set(key, { 
          address: addr, 
          city, 
          state, 
          zip,
          jurisdiction_id: job.jurisdiction_id || null
        });
      }
    });

    console.log(`[process-upload] Found ${addressMap.size} unique addresses`);

    // Check existing properties in batches
    const uniqueAddresses = Array.from(addressMap.keys());
    const PROP_BATCH = 1000;
    const existingMap = new Map<string, string>();

    for (let i = 0; i < uniqueAddresses.length; i += PROP_BATCH) {
      const batch = uniqueAddresses.slice(i, i + PROP_BATCH);
      const addressValues = batch.map(key => {
        const [addr] = key.split('|');
        return addr;
      }).filter(a => a);
      
      if (addressValues.length === 0) continue;

      const { data: existingProps } = await supabaseClient
        .from('properties')
        .select('id, address, city, state, zip')
        .in('address', addressValues);

      (existingProps || []).forEach(prop => {
        const addr = prop.address?.trim() || '';
        const city = prop.city?.trim() || '';
        const state = prop.state?.trim() || '';
        const zip = prop.zip?.trim() || '';
        const key = `${addr}|${city}|${state}|${zip}`.toLowerCase();
        existingMap.set(key, prop.id);
      });
    }

    console.log(`[process-upload] Found ${existingMap.size} existing properties`);

    // Prepare properties without geocoding (will be done in background)
    const newAddressEntries = Array.from(addressMap.entries())
      .filter(([key]) => !existingMap.has(key));

    console.log(`[process-upload] Creating ${newAddressEntries.length} new properties (geocoding will happen in background)...`);

    const newProperties = newAddressEntries.map(([_, row]) => {
      const city = row.city || job.city;
      const state = row.state || job.state;

      return {
        address: row.address || 'Unknown',
        city,
        state,
        zip: row.zip || '',
        latitude: null,
        longitude: null,
        snap_score: null,
        snap_insight: null,
        jurisdiction_id: row.jurisdiction_id,
      };
    });

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
        const addr = prop.address?.trim() || '';
        const city = prop.city?.trim() || '';
        const state = prop.state?.trim() || '';
        const zip = prop.zip?.trim() || '';
        const key = `${addr}|${city}|${state}|${zip}`.toLowerCase();
        existingMap.set(key, prop.id);
      });

      console.log(`[process-upload] Created ${propertiesCreated} / ${newProperties.length} properties`);
    }

    console.log(`[process-upload] Total properties created: ${propertiesCreated}`);

    // Update status to CREATING_VIOLATIONS
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        status: 'CREATING_VIOLATIONS',
        properties_created: propertiesCreated
      })
      .eq('id', jobId);

    // Collect all property IDs for insight generation
    const allPropertyIds = Array.from(existingMap.values());

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
      const addr = row.address?.trim() || '';
      const city = row.city?.trim() || '';
      const state = row.state?.trim() || '';
      const zip = row.zip?.trim() || '';
      const key = `${addr}|${city}|${state}|${zip}`.toLowerCase();
      const propertyId = existingMap.get(key);

      if (!propertyId) {
        console.warn(`[process-upload] No property ID for ${key}`);
        continue;
      }

      // Parse dates safely
      let openedDate: Date | null = null;
      let lastUpdated: Date | null = null;
      
      try {
        if (row.opened_date) {
          openedDate = new Date(row.opened_date);
          if (isNaN(openedDate.getTime())) openedDate = null;
        }
      } catch (e) {
        console.warn(`[process-upload] Invalid opened_date: ${row.opened_date}`);
      }
      
      try {
        if (row.last_updated) {
          lastUpdated = new Date(row.last_updated);
          if (isNaN(lastUpdated.getTime())) lastUpdated = null;
        }
      } catch (e) {
        console.warn(`[process-upload] Invalid last_updated: ${row.last_updated}`);
      }
      
      const daysOpen = openedDate 
        ? Math.floor((Date.now() - openedDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      violations.push({
        property_id: propertyId,
        case_id: row.case_id,
        violation_type: row.violation || 'Unknown',
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

    // Mark complete with accurate counts
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        status: 'COMPLETE',
        finished_at: new Date().toISOString(),
        properties_created: propertiesCreated,
        violations_created: violationsCreated
      })
      .eq('id', jobId);

    console.log(`[process-upload] Job ${jobId} complete - ${propertiesCreated} properties, ${violationsCreated} violations`);

    // Trigger insight generation for all properties in this upload
    console.log(`[process-upload] Triggering insight generation for ${allPropertyIds.length} properties`);
    try {
      const insightsResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ propertyIds: allPropertyIds }),
      });
      
      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        console.log(`[process-upload] Insights generated: ${insightsData.processed || 0} properties`);
      } else {
        console.error(`[process-upload] Insights generation failed: ${insightsResponse.status}`);
      }
    } catch (insightError) {
      console.error('[process-upload] Error triggering insights:', insightError);
      // Don't fail the job if insights fail
    }

    // Create geocoding job for properties that need it
    console.log(`[process-upload] Creating geocoding job for newly created properties`);
    try {
      // Count properties that need geocoding
      const { count: needsGeocodingCount } = await supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .or('latitude.is.null,longitude.is.null');

      if (needsGeocodingCount && needsGeocodingCount > 0) {
        // Create geocoding job
        const { data: geocodingJob, error: jobError } = await supabase
          .from('geocoding_jobs')
          .insert({
            user_id: job.user_id,
            status: 'queued',
            total_properties: needsGeocodingCount,
            geocoded_count: 0,
            failed_count: 0,
          })
          .select('id')
          .single();

        if (jobError) {
          console.error('[process-upload] Failed to create geocoding job:', jobError);
        } else {
          console.log(`[process-upload] Created geocoding job ${geocodingJob.id} for ${needsGeocodingCount} properties`);
          
          // Trigger geocoding with the job ID (run in background)
          EdgeRuntime.waitUntil(
            (async () => {
              try {
                const geocodingResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/geocode-properties`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  },
                  body: JSON.stringify({ jobId: geocodingJob.id }),
                });
                
                if (geocodingResponse.ok) {
                  console.log(`[process-upload] Geocoding started for job ${geocodingJob.id}`);
                } else {
                  console.error(`[process-upload] Geocoding trigger failed: ${geocodingResponse.status}`);
                }
              } catch (error) {
                console.error('[process-upload] Error triggering geocoding:', error);
              }
            })()
          );
        }
      } else {
        console.log('[process-upload] No properties need geocoding');
      }
    } catch (geocodingError) {
      console.error('[process-upload] Error setting up geocoding:', geocodingError);
      // Don't fail the job if geocoding setup fails
    }

    console.log(`[process-upload] Upload complete with automatic insights and geocoding triggered.`);

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
