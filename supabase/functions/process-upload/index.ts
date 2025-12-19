import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { parse } from "https://deno.land/std@0.168.0/encoding/csv.ts";

// ============================================
// UPLOAD LIMITS - Change these to adjust capacity
// ============================================
const MAX_ROWS_PER_UPLOAD = 50000;  // Maximum rows allowed in a single CSV
const STAGING_BATCH_SIZE = 1000;    // Rows per batch for staging inserts
const PROP_INSERT_BATCH = 500;      // Properties per batch for inserts
const VIOL_BATCH_SIZE = 500;        // Violations per batch for inserts
const MAX_FILE_SIZE_MB = 50;        // Maximum file size in MB

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

    // Validate file size before processing
    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (job.file_size > maxBytes) {
      throw new Error(`File size (${Math.round(job.file_size / 1024 / 1024)}MB) exceeds maximum of ${MAX_FILE_SIZE_MB}MB. Please use a smaller file.`);
    }

    console.log(`[process-upload] Using location: ${job.city}, ${job.county || 'N/A'}, ${job.state}`);
    console.log(`[process-upload] File size: ${Math.round(job.file_size / 1024)}KB`);

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

    // Validate row count to prevent memory issues
    if (totalRows > MAX_ROWS_PER_UPLOAD) {
      throw new Error(
        `CSV has ${totalRows.toLocaleString()} rows, maximum is ${MAX_ROWS_PER_UPLOAD.toLocaleString()}. ` +
        `Please split into multiple files.`
      );
    }
    
    console.log(`[process-upload] CSV Headers: ${JSON.stringify(headers)}`);
    console.log(`[process-upload] Parsed ${totalRows} rows from CSV (limit: ${MAX_ROWS_PER_UPLOAD})`);

    // Update total rows
    await supabaseClient
      .from('upload_jobs')
      .update({ total_rows: totalRows })
      .eq('id', jobId);

    // Parse and insert into staging in batches for memory efficiency
    const stagingRows: any[] = [];
    
    for (let i = 0; i < dataRows.length; i++) {
      const values = dataRows[i];
      const row: any = {};
      
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim() || null;
      });

      // Flexible column mapping - support multiple CSV formats
      const caseId = row.case_id || row['case/file id'] || row['file #'] || row.file_number || row.id || row['file number'] || null;
      const address = row.address || row.location || row.property_address || row['property address'] || '';
      const violationType = row.category || row.violation || row.type || row.violation_type || row['violation type'] || row.violation_category || '';
      const openDate = row.opened_date || row.open_date || row['open date'] || row.date || row.date_opened || null;
      const closeDate = row.close_date || row['close date'] || row.closed_date || row.date_closed || null;
      const description = row.description || row.violation_description || row.notes || row.comments || null;
      
      stagingRows.push({
        job_id: jobId,
        row_num: i + 1,
        case_id: caseId,
        address: address,
        city: row.city || job.city,
        state: row.state?.length === 2 ? row.state : job.state,
        zip: row.zip || row.zipcode || row['zip code'] || '',
        violation: violationType,
        status: row.status || 'Open',
        opened_date: openDate,
        last_updated: closeDate || row.last_updated || null,
        jurisdiction_id: job.jurisdiction_id || null,
        raw_description: description, // Store raw notes for AI processing (INTERNAL ONLY)
      });

      if (stagingRows.length >= STAGING_BATCH_SIZE || i === dataRows.length - 1) {
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

    // Get unique addresses from staging (including case_id and row_num for parcel-based locations)
    // IMPORTANT: Must paginate to avoid 1000 row default limit
    let stagingData: any[] = [];
    let dedupOffset = 0;
    const DEDUP_BATCH = 5000;
    
    while (true) {
      const { data: dedupBatch, error: dedupError } = await supabaseClient
        .from('upload_staging')
        .select('address, city, state, zip, case_id, row_num, jurisdiction_id')
        .eq('job_id', jobId)
        .order('row_num')
        .range(dedupOffset, dedupOffset + DEDUP_BATCH - 1);
      
      if (dedupError) {
        throw new Error(`Failed to fetch staging data for dedup: ${dedupError.message}`);
      }
      
      if (!dedupBatch || dedupBatch.length === 0) break;
      
      stagingData = stagingData.concat(dedupBatch);
      console.log(`[process-upload] Dedup fetch: ${stagingData.length} staging rows so far...`);
      
      if (dedupBatch.length < DEDUP_BATCH) break; // Last batch
      dedupOffset += DEDUP_BATCH;
    }

    if (stagingData.length === 0) {
      throw new Error('No staging data found');
    }
    
    console.log(`[process-upload] Total staging rows fetched for dedup: ${stagingData.length}`);

    // Group by address - for empty addresses, group by case_id to avoid duplicates
    const addressMap = new Map<string, any>();
    stagingData.forEach(row => {
      let addr = row.address?.trim();
      const city = row.city?.trim() || job.city;
      const state = row.state?.trim() || job.state;
      let zip = row.zip?.trim() || '';
      
      // If address is empty, group by parcel number (case_id)
      if (!addr || addr === '') {
        if (row.case_id && row.case_id.trim() !== '') {
          // Use parcel number to create ONE property per unique case_id
          addr = `Parcel-Based Location (Parcel ${row.case_id.trim()})`;
          zip = ''; // Normalize zip for parcel-based locations
        } else {
          // If no case_id either, create one property for all unknown parcels
          addr = `Parcel-Based Location (Unknown Parcel)`;
          zip = '';
        }
      }
      
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
    // NOTE: Deduplication is enforced at DB level via idx_properties_unique_address unique index
    // This is the SOURCE OF TRUTH for property deduplication - app-level checks are for optimization only
    const newAddressEntries = Array.from(addressMap.entries())
      .filter(([key]) => !existingMap.has(key));

    console.log(`[process-upload] Creating ${newAddressEntries.length} new properties (geocoding will happen in background)...`);
    console.log(`[process-upload] App-level dedup filtered ${addressMap.size - newAddressEntries.length} existing properties`);

    const newProperties = newAddressEntries.map(([key, row]) => {
      const city = row.city || job.city;
      const state = row.state || job.state;

      return {
        key, // Include key for mapping after insert
        address: row.address || 'Parcel-Based Location',
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
    const PROP_INSERT_BATCH = 200;

    // OPTIMIZED: Batch insert properties instead of one-by-one
    // This reduces ~1000+ DB calls to just a few batch operations
    for (let i = 0; i < newProperties.length; i += PROP_INSERT_BATCH) {
      const batch = newProperties.slice(i, i + PROP_INSERT_BATCH);
      const batchData = batch.map(({ key, ...propData }) => propData);
      const batchKeys = batch.map(p => p.key);
      
      // Try bulk insert first (much faster for new properties)
      const { data: insertedProps, error: insertError } = await supabaseClient
        .from('properties')
        .upsert(batchData, { 
          onConflict: 'address,city,state,zip',
          ignoreDuplicates: true 
        })
        .select('id, address, city, state, zip');

      if (insertError) {
        console.error('[process-upload] Batch insert error:', insertError);
        // Fall back to individual inserts only if batch fails
        for (let j = 0; j < batchData.length; j++) {
          const propData = batchData[j];
          const key = batchKeys[j];
          
          const { data: singleProp } = await supabaseClient
            .from('properties')
            .upsert(propData, { onConflict: 'address,city,state,zip', ignoreDuplicates: true })
            .select('id, address, city, state, zip')
            .maybeSingle();
          
          if (singleProp) {
            existingMap.set(key, singleProp.id);
            propertiesCreated++;
          }
        }
      } else if (insertedProps) {
        // Map inserted properties back to keys
        for (const prop of insertedProps) {
          const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
          existingMap.set(key, prop.id);
          propertiesCreated++;
        }
      }

      // Update progress during property creation
      await supabaseClient
        .from('upload_jobs')
        .update({ 
          status: 'DEDUPING',
          processed_rows: Math.min(i + PROP_INSERT_BATCH, newProperties.length)
        })
        .eq('id', jobId);

      console.log(`[process-upload] Property batch ${Math.floor(i / PROP_INSERT_BATCH) + 1}: processed ${Math.min(i + PROP_INSERT_BATCH, newProperties.length)}/${newProperties.length}`);
    }

    // For properties that failed upsert (already existed), fetch their IDs in bulk
    const missingKeys = Array.from(addressMap.keys()).filter(key => !existingMap.has(key));
    if (missingKeys.length > 0) {
      console.log(`[process-upload] Fetching ${missingKeys.length} existing property IDs...`);
      
      // Fetch all existing properties in one query
      const missingAddresses = missingKeys.map(key => key.split('|')[0]);
      const { data: existingFetch } = await supabaseClient
        .from('properties')
        .select('id, address, city, state, zip')
        .in('address', missingAddresses);
      
      (existingFetch || []).forEach(prop => {
        const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
        if (!existingMap.has(key)) {
          existingMap.set(key, prop.id);
        }
      });
    }

    console.log(`[process-upload] Total properties in map: ${existingMap.size}, created: ${propertiesCreated}`);

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

    // Insert violations in batches - process in streaming fashion to avoid memory issues
    // Process staging rows in chunks instead of loading all into memory
    const STAGING_FETCH_BATCH = 1000;
    const VIOL_INSERT_BATCH = 500;
    let stagingOffset = 0;
    let violationsCreatedTotal = 0;
    let skippedRows = 0;

    console.log(`[process-upload] Starting violation creation (streaming batches of ${STAGING_FETCH_BATCH})...`);

    while (true) {
      // Fetch a batch of staging rows
      const { data: stagingBatch, error: stagingError } = await supabaseClient
        .from('upload_staging')
        .select('*')
        .eq('job_id', jobId)
        .order('row_num')
        .range(stagingOffset, stagingOffset + STAGING_FETCH_BATCH - 1);

      if (stagingError) {
        throw new Error(`Failed to fetch staging data: ${stagingError.message}`);
      }

      if (!stagingBatch || stagingBatch.length === 0) {
        console.log(`[process-upload] No more staging rows at offset ${stagingOffset}`);
        break;
      }

      console.log(`[process-upload] Processing staging batch: offset=${stagingOffset}, count=${stagingBatch.length}`);

      // Process this batch of staging rows into violations
      const violations: any[] = [];

      for (const row of stagingBatch) {
        let addr = row.address?.trim();
        const city = row.city?.trim() || '';
        const state = row.state?.trim() || '';
        let zip = row.zip?.trim() || '';
        
        // Match the parcel-based location format from property creation
        if (!addr || addr === '') {
          if (row.case_id && row.case_id.trim() !== '') {
            addr = `Parcel-Based Location (Parcel ${row.case_id.trim()})`;
          } else {
            addr = `Parcel-Based Location (Unknown Parcel)`;
          }
          zip = '';
        }
        
        const key = `${addr}|${city}|${state}|${zip}`.toLowerCase();
        const propertyId = existingMap.get(key);

        if (!propertyId) {
          skippedRows++;
          continue;
        }

        // Parse dates safely
        const openedDate = parseDate(row.opened_date);
        const lastUpdated = parseDate(row.last_updated);
        
        const daysOpen = openedDate 
          ? Math.floor((Date.now() - openedDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const normalizedType = normalizeViolationType(row.violation || 'Unknown');
        
        violations.push({
          property_id: propertyId,
          case_id: row.case_id,
          violation_type: normalizedType,
          description: null,
          raw_description: row.raw_description || null,
          status: normalizeStatus(row.status || 'Open'),
          opened_date: openedDate ? openedDate.toISOString().split('T')[0] : null,
          last_updated: lastUpdated ? lastUpdated.toISOString().split('T')[0] : null,
          days_open: daysOpen,
        });
      }

      // Insert this batch of violations in sub-batches
      for (let i = 0; i < violations.length; i += VIOL_INSERT_BATCH) {
        const insertBatch = violations.slice(i, i + VIOL_INSERT_BATCH);
        
        const { error: violError } = await supabaseClient
          .from('violations')
          .insert(insertBatch);

        if (violError) {
          console.error('[process-upload] Violation insert error:', violError);
          throw violError;
        }

        violationsCreatedTotal += insertBatch.length;
      }

      console.log(`[process-upload] Violations progress: ${violationsCreatedTotal} created, ${skippedRows} skipped`);

      // Update job progress periodically
      await supabaseClient
        .from('upload_jobs')
        .update({ 
          violations_created: violationsCreatedTotal
        })
        .eq('id', jobId);

      // Move to next batch
      stagingOffset += STAGING_FETCH_BATCH;

      // Check if this was the last batch
      if (stagingBatch.length < STAGING_FETCH_BATCH) {
        break;
      }
    }

    console.log(`[process-upload] Violation creation complete: ${violationsCreatedTotal} created, ${skippedRows} skipped (no property match)`);

    // Mark complete with accurate counts
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        status: 'COMPLETE',
        finished_at: new Date().toISOString(),
        properties_created: propertiesCreated,
        violations_created: violationsCreatedTotal
      })
      .eq('id', jobId);

    console.log(`[process-upload] Job ${jobId} complete - ${propertiesCreated} properties, ${violationsCreatedTotal} violations`);

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
      const { count: needsGeocodingCount } = await supabaseClient
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .or('latitude.is.null,longitude.is.null');

      if (needsGeocodingCount && needsGeocodingCount > 0) {
        // Create geocoding job
        const { data: geocodingJob, error: jobError } = await supabaseClient
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

// Normalize violation type to short generic labels (Exterior, Structural, Utility, Safety, Fire)
function normalizeViolationType(type: string): string {
  const t = (type || '').toLowerCase();
  
  if (t.includes('fire') || t.includes('burn') || t.includes('smoke')) {
    return 'Fire';
  }
  if (t.includes('unsafe') || t.includes('hazard') || t.includes('danger') || t.includes('safety')) {
    return 'Safety';
  }
  if (t.includes('structur') || t.includes('foundation') || t.includes('roof') || t.includes('wall') || t.includes('collapse')) {
    return 'Structural';
  }
  if (t.includes('electric') || t.includes('plumb') || t.includes('water') || t.includes('gas') || t.includes('sewage') || t.includes('utility')) {
    return 'Utility';
  }
  if (t.includes('exterior') || t.includes('facade') || t.includes('siding') || t.includes('paint') || t.includes('window') || t.includes('door') ||
      t.includes('grass') || t.includes('weed') || t.includes('overgrown') || t.includes('fence') || t.includes('yard')) {
    return 'Exterior';
  }
  
  // Default to original type if no match, but clean it up
  return type.trim().substring(0, 50) || 'Unknown';
}

// Normalize status to Open / Closed / Unknown
function normalizeStatus(status: string): string {
  const s = (status || '').toLowerCase();
  
  if (s.includes('open') || s.includes('pending') || s.includes('active') || 
      s.includes('in progress') || s.includes('new') || s.includes('referred') ||
      s.includes('board') || s.includes('hearing')) {
    return 'Open';
  }
  
  if (s.includes('closed') || s.includes('resolved') || s.includes('complete') ||
      s.includes('complied') || s.includes('dismissed') || s.includes('abated')) {
    return 'Closed';
  }
  
  return 'Unknown';
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

// Safe date parser with error handling
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  
  try {
    const date = new Date(dateStr);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn(`[process-upload] Invalid date: ${dateStr}`);
      return null;
    }
    return date;
  } catch (e) {
    console.warn(`[process-upload] Error parsing date: ${dateStr}`, e);
    return null;
  }
}
