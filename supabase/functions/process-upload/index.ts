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

// Valid US state codes (2-letter abbreviations)
const VALID_US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

/**
 * Validate that a string looks like a real city name, not a violation description
 */
function isValidCityName(value: string): boolean {
  if (!value || value.length === 0) return false;
  if (value.length > 50) return false;
  
  // Reject multi-sentence text
  if (/\.\s+[A-Z]/.test(value)) return false;
  
  // Reject violation-like keywords
  const violationKeywords = [
    'violation', 'debris', 'trash', 'weeds', 'overgrown', 'illegal',
    'unpermitted', 'code', 'notice', 'complaint', 'hazard', 'unsafe',
    'repair', 'maintain', 'fence', 'yard', 'property', 'building',
    'structure', 'obstruct', 'block', 'parked', 'stored', 'dumped',
    'please', 'must', 'should', 'shall', 'required', 'notify',
    'backyard', 'front', 'side', 'rear', 'porch', 'roof', 'window',
    'vehicle', 'junk', 'abandoned', 'grass', 'tall', 'high', 'fire'
  ];
  
  const lowerValue = value.toLowerCase();
  for (const keyword of violationKeywords) {
    if (lowerValue.includes(keyword)) return false;
  }
  
  // Reject common violation punctuation
  if (value.includes(':') || value.includes(';')) return false;
  if (value.includes('(') || value.includes(')')) return false;
  if (value.includes('[') || value.includes(']')) return false;
  
  // Reject if starts with numbers/special chars
  if (/^[\d\-#•]/.test(value)) return false;
  
  // City names should be mostly letters/spaces/hyphens
  if (!/^[A-Za-z\s\-'.]+$/.test(value)) return false;
  
  return true;
}

/**
 * Validate that a string is a valid 2-letter US state code
 */
function isValidStateCode(value: string): boolean {
  if (!value || value.length === 0) return false;
  const upperValue = value.trim().toUpperCase();
  return upperValue.length === 2 && VALID_US_STATES.has(upperValue);
}

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

/**
 * Pre-sanitize CSV text to handle malformed quotes in fields.
 * Municipal data often contains unescaped quotes in inspector notes/descriptions.
 * This function makes the CSV parseable while preserving all content.
 */
function sanitizeCsvQuotes(csvText: string): string {
  const lines = csvText.split(/\r?\n/);
  const result: string[] = [];
  
  for (const line of lines) {
    if (!line.trim()) {
      result.push(line);
      continue;
    }
    
    // Parse each field, handling quoted and unquoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (!inQuotes && current === '') {
          // Start of quoted field
          inQuotes = true;
          current += char;
        } else if (inQuotes) {
          // Check if this is an escaped quote ("") or end of field
          if (i + 1 < line.length && line[i + 1] === '"') {
            // Escaped quote - keep both
            current += '""';
            i++;
          } else if (i + 1 >= line.length || line[i + 1] === ',') {
            // End of quoted field
            current += char;
            inQuotes = false;
          } else {
            // Bare quote inside quoted field - escape it
            current += '""';
          }
        } else {
          // Bare quote in unquoted field - this is the problem case
          // Wrap the entire remaining field content in quotes
          // Find the next comma (end of field)
          let fieldEnd = i;
          while (fieldEnd < line.length && line[fieldEnd] !== ',') {
            fieldEnd++;
          }
          // Get the rest of this field including the quote
          const restOfField = line.substring(i, fieldEnd);
          // Escape any quotes and wrap
          current = '"' + current + restOfField.replace(/"/g, '""') + '"';
          i = fieldEnd - 1; // Will be incremented at end of loop
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    
    // Handle unclosed quotes at end of line
    if (inQuotes && current.startsWith('"') && !current.endsWith('"')) {
      current += '"';
    }
    
    // Push last field
    fields.push(current);
    
    result.push(fields.join(','));
  }
  
  return result.join('\n');
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

    const rawCsvText = await fileData.text();
    
    // Pre-sanitize CSV to handle malformed quotes in municipal data
    console.log(`[process-upload] Sanitizing CSV quotes...`);
    const csvText = sanitizeCsvQuotes(rawCsvText);
    
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

    // Update total rows AND set status to PROCESSING immediately so frontend sees progress
    await supabaseClient
      .from('upload_jobs')
      .update({ 
        total_rows: totalRows,
        status: 'PROCESSING',
        processed_rows: 0
      })
      .eq('id', jobId);

    console.log(`[process-upload] Starting staging inserts for ${totalRows} rows`);

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
      
      // Validate city/state from CSV row - only use if they look valid
      let rowCity = row.city?.trim() || '';
      let rowState = row.state?.trim().toUpperCase() || '';
      
      // If CSV city/state look invalid (like violation text), use job defaults
      const csvCityValid = isValidCityName(rowCity);
      const csvStateValid = isValidStateCode(rowState);
      
      const finalCity = csvCityValid ? rowCity : job.city;
      const finalState = csvStateValid ? rowState : job.state;
      
      // Log validation failures for debugging
      if (!csvCityValid && rowCity) {
        console.log(`[process-upload] Row ${i + 1}: Invalid city "${rowCity.substring(0, 50)}..." - using job default`);
      }
      if (!csvStateValid && rowState) {
        console.log(`[process-upload] Row ${i + 1}: Invalid state "${rowState}" - using job default`);
      }
      
      stagingRows.push({
        job_id: jobId,
        row_num: i + 1,
        case_id: caseId,
        address: address,
        city: finalCity,
        state: finalState,
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

        // Update progress - keep status as PROCESSING
        const processedCount = i + 1;
        await supabaseClient
          .from('upload_jobs')
          .update({ processed_rows: processedCount })
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
    
    // Use smaller batches to avoid Supabase's default 1000 row limit issue
    const DEDUP_PAGE_SIZE = 1000;
    
    while (true) {
      const { data: dedupBatch, error: dedupError } = await supabaseClient
        .from('upload_staging')
        .select('address, city, state, zip, case_id, row_num, jurisdiction_id')
        .eq('job_id', jobId)
        .order('row_num')
        .range(dedupOffset, dedupOffset + DEDUP_PAGE_SIZE - 1);
      
      if (dedupError) {
        throw new Error(`Failed to fetch staging data for dedup: ${dedupError.message}`);
      }
      
      if (!dedupBatch || dedupBatch.length === 0) break;
      
      stagingData = stagingData.concat(dedupBatch);
      console.log(`[process-upload] Dedup fetch: ${stagingData.length} staging rows so far...`);
      
      if (dedupBatch.length < DEDUP_PAGE_SIZE) break; // Last batch
      dedupOffset += DEDUP_PAGE_SIZE;
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

    // Check existing properties - need case-insensitive match since index uses lower(TRIM())
    const uniqueAddresses = Array.from(addressMap.keys());
    const existingMap = new Map<string, string>();

    // Get all unique cities from the upload
    const uniqueCities = [...new Set(Array.from(addressMap.values()).map(row =>
      (row.city || job.city || '').toLowerCase().trim()
    ))].filter(c => c);

    if (uniqueCities.length > 0) {
      // Fetch all properties in these cities - more efficient than per-address lookups
      // PERFORMANCE FIX: Filter by cities in this upload instead of fetching entire database
      console.log(`[process-upload] Fetching existing properties from ${uniqueCities.length} cities: ${uniqueCities.slice(0, 5).join(', ')}${uniqueCities.length > 5 ? '...' : ''}`);

      // Build case-insensitive city filter (OR query for multiple cities)
      const cityFilters = uniqueCities.map(city => `city.ilike.${city}`).join(',');

      const { data: existingProps, error: existingError } = await supabaseClient
        .from('properties')
        .select('id, address, city, state, zip')
        .or(cityFilters)  // Filter to only cities in this upload
        .limit(50000);  // Safety limit to prevent unbounded queries

      if (existingError) {
        console.error('[process-upload] Error fetching existing properties:', existingError);
        // Continue with empty map - will create all as new
      }

      // Build map with lowercase keys for matching
      (existingProps || []).forEach(prop => {
        const addr = (prop.address || '').trim().toLowerCase();
        const city = (prop.city || '').trim().toLowerCase();
        const state = (prop.state || '').trim().toLowerCase();
        const zip = (prop.zip || '').trim().toLowerCase();
        const key = `${addr}|${city}|${state}|${zip}`;
        existingMap.set(key, prop.id);
      });

      console.log(`[process-upload] Loaded ${existingProps?.length || 0} existing properties from database`);
    }

    console.log(`[process-upload] Found ${existingMap.size} existing properties matching upload addresses`);

    // Prepare properties without geocoding (will be done in background)
    // NOTE: Deduplication is enforced at DB level via idx_properties_unique_address unique index
    // This is the SOURCE OF TRUTH for property deduplication - app-level checks are for optimization only
    const newAddressEntries = Array.from(addressMap.entries())
      .filter(([key]) => !existingMap.has(key));

    console.log(`[process-upload] Property deduplication summary:`);
    console.log(`[process-upload]   - Unique addresses in CSV: ${addressMap.size}`);
    console.log(`[process-upload]   - Already exist in database: ${existingMap.size}`);
    console.log(`[process-upload]   - New properties to create: ${newAddressEntries.length}`);

    if (newAddressEntries.length === 0 && addressMap.size > 0) {
      console.log(`[process-upload] ⚠️ All properties already exist - this is normal if re-uploading violations for existing properties`);
    }

    const newProperties = newAddressEntries.map(([key, row]) => {
      const city = row.city || job.city;
      const state = row.state || job.state;
      
      // IMPORTANT: Normalize address to UPPERCASE for consistent matching
      // This prevents case-sensitivity issues when matching violations to properties
      const normalizedAddress = (row.address || 'Parcel-Based Location').toUpperCase().trim();

      return {
        key, // Include key for mapping after insert
        address: normalizedAddress,
        city: city.trim(),
        state: (state || '').toUpperCase().trim(),
        zip: (row.zip || '').trim(),
        latitude: null,
        longitude: null,
        snap_score: null,
        snap_insight: null,
        jurisdiction_id: row.jurisdiction_id,
      };
    });

    let propertiesCreated = 0;
    let dbLevelDedupes = 0;
    const PROP_INSERT_BATCH = 100;

    // OPTIMIZED: Pre-fetch existing properties in batch, then only insert truly new ones
    for (let i = 0; i < newProperties.length; i += PROP_INSERT_BATCH) {
      const batch = newProperties.slice(i, i + PROP_INSERT_BATCH);
      
      // First, fetch all existing properties that match this batch's addresses AND cities
      // Use case-insensitive matching via ilike filters
      const batchAddresses = [...new Set(batch.map(p => p.address.toLowerCase()))];
      const batchCities = [...new Set(batch.map(p => p.city.toLowerCase()))];
      
      // Build OR filter for case-insensitive address matching
      let existingInBatch: any[] = [];
      for (const city of batchCities) {
        const { data: cityProps } = await supabaseClient
          .from('properties')
          .select('id, address, city, state, zip')
          .ilike('city', city);
        if (cityProps) existingInBatch.push(...cityProps);
      }
      
      // Map existing properties - use lowercase full key for consistent matching
      const existingInBatchMap = new Map<string, string>();
      existingInBatch.forEach(prop => {
        const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
        existingInBatchMap.set(key, prop.id);
        existingMap.set(key, prop.id);
      });
      
      // Filter to only truly new properties
      const trulyNew = batch.filter(p => !existingInBatchMap.has(p.key));
      
      if (trulyNew.length > 0) {
        const insertData = trulyNew.map(({ key, ...propData }) => propData);
        
        const { data: insertedProps, error: insertError } = await supabaseClient
          .from('properties')
          .insert(insertData)
          .select('id, address, city, state, zip');

        if (insertError) {
          if (insertError.code === '23505') {
            // Race condition - refetch all and insert remaining one by one
            console.log(`[process-upload] Batch race condition, handling ${trulyNew.length} remaining...`);
            const { data: refetch } = await supabaseClient
              .from('properties')
              .select('id, address, city, state, zip')
              .in('address', trulyNew.map(p => p.address));
            
            const refetchMap = new Map<string, string>();
            (refetch || []).forEach(prop => {
              const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
              refetchMap.set(key, prop.id);
              existingMap.set(key, prop.id);
            });
            
            // Insert remaining that still don't exist
            for (const prop of trulyNew) {
              if (!refetchMap.has(prop.key)) {
                const { key, ...propData } = prop;
                const { data: single, error: singleErr } = await supabaseClient
                  .from('properties')
                  .insert(propData)
                  .select('id')
                  .maybeSingle();
                
                if (single) {
                  existingMap.set(key, single.id);
                  propertiesCreated++;
                } else if (singleErr?.code === '23505') {
                  // Already exists from race - fetch it
                  dbLevelDedupes++;
                  const { data: raceP } = await supabaseClient
                    .from('properties')
                    .select('id, address, city, state, zip')
                    .eq('address', propData.address)
                    .eq('city', propData.city)
                    .maybeSingle();
                  if (raceP) existingMap.set(key, raceP.id);
                }
              }
            }
          } else {
            console.error('[process-upload] Batch insert error:', insertError);
            throw insertError;
          }
        } else if (insertedProps) {
          for (const prop of insertedProps) {
            const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
            existingMap.set(key, prop.id);
            propertiesCreated++;
          }
        }
      }

      // Update progress
      await supabaseClient
        .from('upload_jobs')
        .update({ status: 'DEDUPING', processed_rows: i + batch.length })
        .eq('id', jobId);

      console.log(`[process-upload] Properties: ${i + batch.length}/${newProperties.length}, new: ${trulyNew.length}, created: ${propertiesCreated}`);
    }

    // Ensure all addresses are mapped - fetch any still missing
    const missingKeys = Array.from(addressMap.keys()).filter(key => !existingMap.has(key));
    if (missingKeys.length > 0) {
      console.log(`[process-upload] Fetching ${missingKeys.length} remaining property IDs...`);
      
      // Fetch by unique cities instead of addresses - more reliable with case-insensitive matching
      const missingCities = [...new Set(missingKeys.map(key => key.split('|')[1]))];
      
      for (const city of missingCities) {
        const { data: existingFetch } = await supabaseClient
          .from('properties')
          .select('id, address, city, state, zip')
          .ilike('city', city);
        
        (existingFetch || []).forEach(prop => {
          const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
          if (!existingMap.has(key)) existingMap.set(key, prop.id);
        });
      }
    }

    console.log(`[process-upload] Properties mapped: ${existingMap.size}, created: ${propertiesCreated}`);

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
        const rawDesc = row.raw_description || null;

        violations.push({
          property_id: propertyId,
          case_id: row.case_id,
          violation_type: normalizedType,
          description: rawDesc, // Populate immediately with raw description
          raw_description: rawDesc, // Keep raw for AI processing
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

    // ===== ENHANCED PRODUCTION METRICS =====
    console.log(`[process-upload] =====================================================`);
    console.log(`[process-upload] ===== UPLOAD COMPLETE - DETAILED METRICS =====`);
    console.log(`[process-upload] =====================================================`);
    console.log(`[process-upload]`);
    console.log(`[process-upload] 📊 CSV INPUT:`);
    console.log(`[process-upload]   • Total rows processed: ${totalRows}`);
    console.log(`[process-upload]   • Unique addresses in CSV: ${addressMap.size}`);
    console.log(`[process-upload]   • Avg rows per address: ${(totalRows / addressMap.size).toFixed(2)}`);
    console.log(`[process-upload]`);
    console.log(`[process-upload] 🏠 PROPERTY DEDUPLICATION:`);
    console.log(`[process-upload]   • Already existed in database: ${existingMap.size - propertiesCreated}`);
    console.log(`[process-upload]   • Newly created properties: ${propertiesCreated}`);
    console.log(`[process-upload]   • DB-level dedupes caught: ${dbLevelDedupes}`);
    console.log(`[process-upload]   • Total unique properties: ${existingMap.size}`);
    console.log(`[process-upload]   • Dedup rate: ${Math.round(((existingMap.size - propertiesCreated) / addressMap.size) * 100)}%`);
    console.log(`[process-upload]`);
    console.log(`[process-upload] ⚠️  VIOLATIONS:`);
    console.log(`[process-upload]   • Successfully created: ${violationsCreatedTotal}`);
    console.log(`[process-upload]   • Skipped (no property match): ${skippedRows}`);
    console.log(`[process-upload]   • Success rate: ${Math.round((violationsCreatedTotal / totalRows) * 100)}%`);
    console.log(`[process-upload]   • Avg violations per property: ${(violationsCreatedTotal / existingMap.size).toFixed(2)}`);
    console.log(`[process-upload]`);
    console.log(`[process-upload] ✅ DATA INTEGRITY:`);
    console.log(`[process-upload]   • Properties with violations: ${allPropertyIds.length}`);
    console.log(`[process-upload]   • Orphaned violations: ${skippedRows}`);
    console.log(`[process-upload]   • Property match rate: ${Math.round((allPropertyIds.length / addressMap.size) * 100)}%`);
    console.log(`[process-upload]`);

    // CRITICAL ALERT: Warn if violations were orphaned
    if (skippedRows > 0) {
      console.error(`[process-upload] =====================================================`);
      console.error(`[process-upload] ⚠️⚠️⚠️  DATA QUALITY ALERT  ⚠️⚠️⚠️`);
      console.error(`[process-upload] =====================================================`);
      console.error(`[process-upload] ${skippedRows} violations could not be matched to properties!`);
      console.error(`[process-upload] This indicates:`);
      console.error(`[process-upload]   1. Deduplication key mismatch between property creation and violation lookup`);
      console.error(`[process-upload]   2. Property insert failed AND fallback lookup also failed`);
      console.error(`[process-upload]   3. Data quality issue in CSV (mismatched city/state/zip)`);
      console.error(`[process-upload] ACTION REQUIRED: Review staging data for rows that failed to match`);
      console.error(`[process-upload] =====================================================`);
    } else {
      console.log(`[process-upload] ✅ All violations successfully matched to properties`);
    }

    console.log(`[process-upload] =====================================================`);

    // ===== GENERATE INSIGHTS BEFORE MARKING COMPLETE =====
    // IMPORTANT: Run insights synchronously so "COMPLETE" status means insights are done
    // This prevents UI showing "Upload Complete" while insights are still generating
    console.log(`[process-upload] Generating insights for ${allPropertyIds.length} properties...`);

    let insightsGenerated = 0;
    if (allPropertyIds.length > 0) {
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
          insightsGenerated = insightsData.processed || 0;
          const breakdown = insightsData.breakdown || {};
          console.log(`[process-upload] ✓ Insights generated: ${insightsGenerated} properties`);
          console.log(`[process-upload]   - AI-generated: ${breakdown.ai_generated || 0}`);
          console.log(`[process-upload]   - Rule-based: ${breakdown.rule_based || 0}`);
          console.log(`[process-upload]   - No data: ${breakdown.no_data || 0}`);

          if (breakdown.rule_based > 0) {
            console.warn(`[process-upload] ⚠️ ${breakdown.rule_based} properties using rule-based insights (LOVABLE_API_KEY may not be configured)`);
          }
        } else {
          const errorText = await insightsResponse.text();
          console.error(`[process-upload] ✗ Insights generation failed: HTTP ${insightsResponse.status}`);
          console.error(`[process-upload] Response: ${errorText}`);
          // Continue - insights are enhancement, not critical for upload success
        }
      } catch (insightError) {
        console.error('[process-upload] ✗ Error during insight generation:', insightError);
        console.error('[process-upload] Upload will complete but properties may lack AI insights');
        // Continue - don't fail upload if insights fail
      }
    } else {
      console.log('[process-upload] No properties created, skipping insight generation');
    }

    // Build warnings array for data quality issues
    const warnings: string[] = [];
    if (skippedRows > 0) {
      warnings.push(`${skippedRows} violations could not be matched to properties (orphaned)`);
    }
    if (insightsGenerated < allPropertyIds.length && allPropertyIds.length > 0) {
      warnings.push(`Only ${insightsGenerated}/${allPropertyIds.length} properties received insights`);
    }

    // NOW mark complete - insights are done
    await supabaseClient
      .from('upload_jobs')
      .update({
        status: 'COMPLETE',
        finished_at: new Date().toISOString(),
        properties_created: propertiesCreated,
        violations_created: violationsCreatedTotal,
        rows_skipped: skippedRows,
        insights_generated: insightsGenerated,
        warnings: warnings.length > 0 ? warnings : null
      })
      .eq('id', jobId);

    console.log(`[process-upload] Job ${jobId} marked COMPLETE`);
    console.log(`[process-upload]   • Insights: ${insightsGenerated}/${allPropertyIds.length} generated`);
    console.log(`[process-upload]   • Data quality: ${warnings.length} warning(s)`);

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
