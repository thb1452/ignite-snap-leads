import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import Papa from "https://esm.sh/papaparse@5.4.1";

// ============================================
// UPLOAD LIMITS - Change these to adjust capacity
// Edge functions have ~150MB memory limit, so we must be conservative
// Statement timeout is typically 30-60s, so keep batches VERY small
// ============================================
const MAX_ROWS_PER_UPLOAD = 50000;  // Maximum rows allowed in a single CSV
const STAGING_BATCH_SIZE = 100;     // Rows per batch for staging inserts (REDUCED to prevent timeouts)
const PROP_INSERT_BATCH = 25;       // Properties per batch for inserts (very small to prevent timeouts)
const VIOL_BATCH_SIZE = 50;         // Violations per batch for inserts (REDUCED)
const MAX_FILE_SIZE_MB = 15;        // Maximum file size in MB (edge function memory limit)

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

// Known cities for smart extraction from address fields
const KNOWN_CITIES_CA = [
  'Anaheim', 'Santa Ana', 'Orange', 'Irvine', 'Huntington Beach',
  'Costa Mesa', 'Fullerton', 'Garden Grove', 'Tustin', 'Westminster',
  'Newport Beach', 'Buena Park', 'Lake Forest', 'San Clemente',
  'Mission Viejo', 'Yorba Linda', 'San Juan Capistrano', 'Laguna Niguel',
  'La Habra', 'Fountain Valley', 'Placentia', 'Rancho Santa Margarita',
  'Aliso Viejo', 'Laguna Beach', 'Stanton', 'Cypress', 'Dana Point',
  'Laguna Hills', 'Seal Beach', 'Brea', 'La Palma', 'Los Alamitos',
  'Villa Park', 'Midway City', 'Silverado', 'Trabuco Canyon', 'Ladera Ranch',
  'Coto De Caza', 'Las Flores', 'Rancho Mission Viejo', 'Rossmoor',
  'Los Angeles', 'San Diego', 'San Francisco', 'San Jose', 'Oakland',
  'Long Beach', 'Sacramento', 'Fresno', 'Bakersfield', 'Riverside'
];

const KNOWN_CITIES_NV = [
  'Carson City', 'Reno', 'Sparks', 'Henderson', 'Las Vegas', 'North Las Vegas',
  'Elko', 'Boulder City', 'Mesquite', 'Fallon', 'Fernley', 'Winnemucca',
  'Pahrump', 'Incline Village', 'Minden', 'Gardnerville', 'Dayton', 'Yerington'
];

const ALL_KNOWN_CITIES = [...KNOWN_CITIES_CA, ...KNOWN_CITIES_NV];

/**
 * Sanitize date string before inserting into staging - reject invalid dates
 * This prevents Postgres errors like "date/time field value out of range"
 */
function sanitizeDateString(dateStr: string | null): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  
  const str = dateStr.trim();
  
  // Try to parse as ISO date (YYYY-MM-DD) or common date formats
  // First check for obviously invalid dates like 2025-00-11, 2025-91-30
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    
    // Validate ranges
    if (year < 1900 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
  }
  
  // Also check for MM/DD/YYYY format
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (usMatch) {
    const month = parseInt(usMatch[1], 10);
    const day = parseInt(usMatch[2], 10);
    const year = parseInt(usMatch[3], 10);
    
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 1900 && year > 99) return null; // Allow 2-digit years
  }
  
  // Try to parse and validate the date
  try {
    const parsed = new Date(str);
    if (isNaN(parsed.getTime())) return null;
    
    // Check if date is reasonable (between 1950 and 2100)
    const year = parsed.getFullYear();
    if (year < 1950 || year > 2100) return null;
    
    // Return original string if valid
    return str;
  } catch {
    return null;
  }
}

/**
 * Extract city from address field if city column is empty or contains a zip code
 */
function extractCityFromAddress(
  address: string,
  cityField: string,
  stateField: string
): { cleanAddress: string; extractedCity: string } {
  const trimmedCity = cityField?.trim() || '';
  const addressTrimmed = address.trim();
  
  // Check if city field needs extraction (empty or contains a zip code)
  const needsExtraction = !trimmedCity || /^\d{5}(-\d{4})?$/.test(trimmedCity);
  
  if (!needsExtraction) {
    return { cleanAddress: addressTrimmed, extractedCity: trimmedCity };
  }
  
  console.log(`[process-upload] City extraction needed for address: "${addressTrimmed.substring(0, 60)}..." (city field: "${trimmedCity}")`);
  
  // Try to find known city at end of address (sorted by length to match longer names first)
  const sortedCities = [...ALL_KNOWN_CITIES].sort((a, b) => b.length - a.length);
  
  for (const city of sortedCities) {
    // Match city at end of address, with optional comma before
    const cityPattern = new RegExp(`[,\\s]+${city.replace(/\s+/g, '\\s+')}\\s*$`, 'i');
    
    if (cityPattern.test(addressTrimmed)) {
      // Found city at end of address - extract it
      const cleanAddress = addressTrimmed.replace(cityPattern, '').trim();
      console.log(`[process-upload] ✓ Extracted known city "${city}" from address`);
      return { cleanAddress, extractedCity: city };
    }
  }
  
  // Fallback: try to extract last word(s) as potential city
  const parts = addressTrimmed.split(/\s+/);
  
  if (parts.length >= 2) {
    // Try last 2 words first (for cities like "Santa Ana", "Los Alamitos")
    const last2Words = parts.slice(-2).join(' ');
    if (/^[A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+$/.test(last2Words)) {
      const cleanAddress = parts.slice(0, -2).join(' ').replace(/,\s*$/, '');
      console.log(`[process-upload] ✓ Inferred 2-word city "${last2Words}" from address`);
      return { cleanAddress, extractedCity: last2Words };
    }
    
    // Try last 1 word (for cities like "Anaheim", "Orange", "Tustin")
    const lastWord = parts[parts.length - 1];
    if (/^[A-Z][a-zA-Z]+$/.test(lastWord) && lastWord.length >= 4) {
      const cleanAddress = parts.slice(0, -1).join(' ').replace(/,\s*$/, '');
      console.log(`[process-upload] ✓ Inferred 1-word city "${lastWord}" from address`);
      return { cleanAddress, extractedCity: lastWord };
    }
  }
  
  console.log(`[process-upload] ✗ Could not extract city from address`);
  return { cleanAddress: addressTrimmed, extractedCity: trimmedCity };
}

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
 * Parse CSV using papaparse which properly handles:
 * - Multi-line quoted fields
 * - Escaped quotes within fields
 * - Malformed CSVs from municipal sources
 */
function parseCSVWithPapaparse(csvText: string): { headers: string[], dataRows: Record<string, any>[] } {
  console.log('[process-upload] Parsing CSV with papaparse...');
  
  const parseResult = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
    transform: (value: string) => {
      // Flatten multi-line values by replacing newlines with spaces
      return value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
  });

  if (parseResult.errors && parseResult.errors.length > 0) {
    console.warn('[process-upload] CSV parse warnings:', JSON.stringify(parseResult.errors.slice(0, 10)));
  }

  const headers = parseResult.meta?.fields || [];
  const dataRows = parseResult.data as Record<string, any>[];
  
  console.log(`[process-upload] Papaparse detected ${headers.length} columns: ${headers.join(', ')}`);
  console.log(`[process-upload] Parsed ${dataRows.length} rows from CSV`);
  
  return { headers, dataRows };
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

    // Determine scope: if city is missing but county+state are present, it's a county-level upload
    const isCountyScope = !job.city && job.county && job.state;
    const isCityScope = job.city && job.state;
    
    if (!isCityScope && !isCountyScope) {
      throw new Error('Job missing required location information. Need either (city + state) or (county + state)');
    }
    
    const scope = isCountyScope ? 'county' : 'city';
    console.log(`[process-upload] Upload scope: ${scope}`);
    
    // Update job with scope
    await supabaseClient
      .from('upload_jobs')
      .update({ scope })
      .eq('id', jobId);

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
    
    // Parse CSV using papaparse (handles multi-line quoted fields properly)
    const { headers, dataRows: parsedRows } = parseCSVWithPapaparse(rawCsvText);
    
    if (parsedRows.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const totalRows = parsedRows.length;

    // Validate row count to prevent memory issues
    if (totalRows > MAX_ROWS_PER_UPLOAD) {
      throw new Error(
        `CSV has ${totalRows.toLocaleString()} rows, maximum is ${MAX_ROWS_PER_UPLOAD.toLocaleString()}. ` +
        `Please split into multiple files.`
      );
    }
    
    console.log(`[process-upload] CSV Headers: ${JSON.stringify(headers)}`);
    console.log(`[process-upload] Processing ${totalRows} rows (limit: ${MAX_ROWS_PER_UPLOAD})`);

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

    // IDEMPOTENCY CHECK: Skip staging if rows already exist (prevents duplicates on retry)
    const { count: existingStagingCount } = await supabaseClient
      .from('upload_staging')
      .select('*', { count: 'exact', head: true })
      .eq('job_id', jobId);

    if (existingStagingCount && existingStagingCount > 0) {
      console.log(`[process-upload] ⚠️ Staging already has ${existingStagingCount} rows - skipping insert phase (idempotency)`);
    } else {
      // Parse and insert into staging in batches for memory efficiency
      const stagingRows: any[] = [];
      
      for (let i = 0; i < parsedRows.length; i++) {
      // papaparse already returns objects with header keys
      const row = parsedRows[i] as Record<string, any>;

      // Flexible column mapping - support multiple CSV formats
      const caseId = row.case_id || row['case/file id'] || row['file #'] || row.file_number || row.id || row['file number'] || null;
      const rawAddress = row.address || row.location || row.property_address || row['property address'] || '';
      const violationType = row.category || row.violation || row.type || row.violation_type || row['violation type'] || row.violation_category || '';
      // Parse dates immediately to catch invalid values before inserting to staging
      const rawOpenDate = row.opened_date || row.open_date || row['open date'] || row.date || row.date_opened || null;
      const rawCloseDate = row.close_date || row['close date'] || row.closed_date || row.date_closed || null;
      const openDate = sanitizeDateString(rawOpenDate);
      const closeDate = sanitizeDateString(rawCloseDate);
      const description = row.description || row.violation_description || row.notes || row.comments || null;
      
      // Get raw city/state from CSV
      let rawCity = row.city?.trim() || '';
      let rawState = row.state?.trim().toUpperCase() || '';
      
      let address = rawAddress;
      let finalCity: string | null = null;
      let finalState = job.state;
      
      // For COUNTY-SCOPE uploads: skip city extraction entirely, just store null
      // For CITY-SCOPE uploads: attempt smart city extraction
      if (isCountyScope) {
        // County scope: use raw address as-is, no city required
        address = rawAddress.trim();
        finalCity = null; // Will be handled as 'UNINCORPORATED' during property creation
        finalState = job.state || '';
      } else {
        // City scope: attempt smart city extraction
        const { cleanAddress, extractedCity } = extractCityFromAddress(rawAddress, rawCity, rawState);
        address = cleanAddress;
        
        // Use extracted city, fallback to job defaults
        let rowCity = extractedCity || rawCity;
        let rowState = rawState;
        
        // Validate city/state - only use if they look valid
        const csvCityValid = isValidCityName(rowCity);
        const csvStateValid = isValidStateCode(rowState);
        
        finalCity = csvCityValid ? rowCity : job.city;
        finalState = csvStateValid ? rowState : job.state || '';
        
        // Log validation failures for debugging
        if (!csvCityValid && rowCity) {
          console.log(`[process-upload] Row ${i + 1}: Invalid city "${rowCity.substring(0, 50)}..." - using job default`);
        }
        if (!csvStateValid && rowState) {
          console.log(`[process-upload] Row ${i + 1}: Invalid state "${rowState}" - using job default`);
        }
      }
      
      // Truncate fields to prevent index size errors (PostgreSQL btree index limit is ~2700 bytes per column)
      const MAX_ADDRESS_LENGTH = 500;
      const MAX_DESCRIPTION_LENGTH = 2000;
      
      const truncatedAddress = address.length > MAX_ADDRESS_LENGTH ? address.substring(0, MAX_ADDRESS_LENGTH) : address;
      const truncatedDescription = description && description.length > MAX_DESCRIPTION_LENGTH 
        ? description.substring(0, MAX_DESCRIPTION_LENGTH) + '...' 
        : description;
      
      stagingRows.push({
        job_id: jobId,
        row_num: i + 1,
        case_id: caseId,
        address: truncatedAddress,
        city: finalCity, // null for county-scope, valid city for city-scope
        state: finalState,
        zip: row.zip || row.zipcode || row['zip code'] || '',
        violation: violationType,
        status: row.status || 'Open',
        opened_date: openDate,
        last_updated: closeDate || row.last_updated || null,
        jurisdiction_id: job.jurisdiction_id || null,
        raw_description: truncatedDescription, // Store raw notes for AI processing (INTERNAL ONLY)
      });

      if (stagingRows.length >= STAGING_BATCH_SIZE || i === parsedRows.length - 1) {
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
    } // End of idempotency else block

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

    // BALANCED: 1000 rows per batch to prevent timeouts while ensuring ALL rows are fetched
    const DEDUP_PAGE_SIZE = 1000;

    console.log(`[process-upload] ⚠️  CRITICAL: Fetching ALL staging rows for dedup (pagination with batches of ${DEDUP_PAGE_SIZE})...`);

    while (true) {
      const { data: dedupBatch, error: dedupError, count } = await supabaseClient
        .from('upload_staging')
        .select('address, city, state, zip, case_id, row_num, jurisdiction_id', { count: 'exact' })
        .eq('job_id', jobId)
        .order('row_num')
        .range(dedupOffset, dedupOffset + DEDUP_PAGE_SIZE - 1);

      if (dedupError) {
        throw new Error(`Failed to fetch staging data for dedup: ${dedupError.message}`);
      }

      // Log total count on first iteration to verify we're fetching all rows
      if (dedupOffset === 0 && count !== null) {
        console.log(`[process-upload] Total staging rows in database: ${count} (will fetch all in batches of ${DEDUP_PAGE_SIZE})`);
      }

      if (!dedupBatch || dedupBatch.length === 0) {
        console.log(`[process-upload] No more staging rows at offset ${dedupOffset}`);
        break;
      }

      stagingData = stagingData.concat(dedupBatch);
      console.log(`[process-upload] Dedup fetch iteration ${Math.floor(dedupOffset / DEDUP_PAGE_SIZE) + 1}: fetched ${dedupBatch.length} rows, total so far: ${stagingData.length}`);

      if (dedupBatch.length < DEDUP_PAGE_SIZE) {
        console.log(`[process-upload] Last batch (${dedupBatch.length} < ${DEDUP_PAGE_SIZE}), stopping pagination`);
        break; // Last batch
      }
      dedupOffset += DEDUP_PAGE_SIZE;
    }

    if (stagingData.length === 0) {
      throw new Error('No staging data found');
    }

    console.log(`[process-upload] ✓ Total staging rows fetched for dedup: ${stagingData.length}`);

    // BAD ADDRESS DETECTION - patterns that indicate unusable addresses
    const BAD_ADDRESS_PATTERNS = [
      /^parcel[- ]?based\s+location/i,
      /^unknown\s+location/i,
      /^no\s+address/i,
      /^n\/a$/i,
      /^tbd$/i,
      /^pending$/i,
      /^\d+$/,  // Just numbers
      /^[a-z]$/i,  // Single letter
    ];
    
    const isBadAddress = (addr: string): boolean => {
      if (!addr || addr.trim().length < 5) return true;
      return BAD_ADDRESS_PATTERNS.some(pattern => pattern.test(addr.trim()));
    };

    // Group by address - for empty addresses, group by case_id to avoid duplicates
    const addressMap = new Map<string, any>();
    let badAddressCount = 0;
    const badAddressSamples: string[] = [];
    
    stagingData.forEach(row => {
      let addr = row.address?.trim();
      // For county-scope: city is null, use 'UNINCORPORATED' for grouping key
      const city = row.city?.trim() || (isCountyScope ? 'UNINCORPORATED' : job.city) || 'UNINCORPORATED';
      const state = row.state?.trim() || job.state;
      let zip = row.zip?.trim() || '';
      
      // Check if this is a bad/invalid address
      const originalAddr = addr;
      const isBad = isBadAddress(addr || '');
      
      // If address is empty or bad, group by parcel number (case_id)
      if (!addr || addr === '' || isBad) {
        badAddressCount++;
        // Store sample of bad addresses (max 10)
        if (badAddressSamples.length < 10 && originalAddr && originalAddr.trim()) {
          badAddressSamples.push(originalAddr.substring(0, 100));
        }
        
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

    // Update job with bad address count
    if (badAddressCount > 0) {
      console.log(`[process-upload] ⚠️ Found ${badAddressCount} rows with bad/missing addresses`);
      await supabaseClient
        .from('upload_jobs')
        .update({ 
          bad_addresses: badAddressCount,
          bad_address_samples: badAddressSamples
        })
        .eq('id', jobId);
    }

    console.log(`[process-upload] Found ${addressMap.size} unique addresses (${badAddressCount} rows had bad addresses)`);

    // Check existing properties - need case-insensitive match since index uses lower(TRIM())
    const uniqueAddresses = Array.from(addressMap.keys());
    const existingMap = new Map<string, string>();

    // Get all unique cities from the upload
    const uniqueCities = [...new Set(Array.from(addressMap.values()).map(row =>
      (row.city || job.city || '').toLowerCase().trim()
    ))].filter(c => c);

    // Declare at function scope so it's accessible later for calculating new properties
    let totalExistingProps = 0;

    if (uniqueCities.length > 0) {
      // Fetch existing properties city by city to avoid massive OR queries that timeout
      console.log(`[process-upload] Fetching existing properties from ${uniqueCities.length} cities...`);
      
      // Process cities one at a time to prevent query timeout
      for (const city of uniqueCities) {
        const { data: cityProps, error: cityError } = await supabaseClient
          .from('properties')
          .select('id, address, city, state, zip')
          .ilike('city', city)
          .limit(20000);  // Safety limit per city

        if (cityError) {
          console.error(`[process-upload] Error fetching properties for city ${city}:`, cityError);
          continue;
        }

        // Build map with lowercase keys for matching
        (cityProps || []).forEach(prop => {
          const addr = (prop.address || '').trim().toLowerCase();
          const c = (prop.city || '').trim().toLowerCase();
          const state = (prop.state || '').trim().toLowerCase();
          const zip = (prop.zip || '').trim().toLowerCase();
          const key = `${addr}|${c}|${state}|${zip}`;
          existingMap.set(key, prop.id);
        });

        totalExistingProps += (cityProps?.length || 0);
      }

      console.log(`[process-upload] Loaded ${totalExistingProps} existing properties from database`);
    }

    console.log(`[process-upload] Found ${existingMap.size} existing properties matching upload addresses`);

    // Store pre-existing count for accurate properties_created calculation later
    const preExistingCount = existingMap.size;

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
      // For county-scope uploads, city might be null or extracted from CSV
      const propertyCity = row.city || job.city || null;
      const state = row.state || job.state;

      // IMPORTANT: Normalize address to lowercase for consistent matching
      // This matches the database functional index which uses LOWER(TRIM(...))
      const normalizedAddress = (row.address || 'Parcel-Based Location').toLowerCase().trim();

      return {
        key, // Include key for mapping after insert
        address: normalizedAddress,
        city: propertyCity ? propertyCity.trim().toLowerCase() : 'unincorporated', // Use 'unincorporated' for county-scope with no city (lowercase for consistency)
        state: (state || '').trim().toLowerCase(),
        zip: (row.zip || '').trim(),
        county: job.county || null,
        scope: scope,
        latitude: null,
        longitude: null,
        snap_score: null,
        snap_insight: null,
        jurisdiction_id: row.jurisdiction_id,
      };
    });

    let propertiesCreated = 0;
    let dbLevelDedupes = 0;
    const PROP_INSERT_BATCH = 50; // Small batches to prevent timeouts

    // Insert properties in batches with duplicate handling
    // NOTE: Cannot use upsert with onConflict because the unique index is functional: LOWER(TRIM(...))
    // Supabase upsert only works with direct column constraints, not functional indexes
    console.log(`[process-upload] Inserting ${newProperties.length} new properties in batches of ${PROP_INSERT_BATCH}...`);

    for (let i = 0; i < newProperties.length; i += PROP_INSERT_BATCH) {
      const batch = newProperties.slice(i, i + PROP_INSERT_BATCH);
      const insertData = batch.map(({ key, ...propData }) => propData);

      // Try batch insert first
      const { data: insertedProps, error: insertError } = await supabaseClient
        .from('properties')
        .insert(insertData)
        .select('id, address, city, state, zip');

      if (insertError) {
        if (insertError.code === '23505') {
          // Unique constraint violation - batch has duplicates, insert one by one
          console.log(`[process-upload] Batch has duplicates, inserting one-by-one...`);
          for (const prop of insertData) {
            const { data: single, error: singleErr } = await supabaseClient
              .from('properties')
              .insert(prop)
              .select('id, address, city, state, zip')
              .maybeSingle();

            if (single) {
              const key = `${single.address}|${single.city}|${single.state}|${single.zip}`.toLowerCase();
              existingMap.set(key, single.id);
              propertiesCreated++;
            } else if (singleErr?.code === '23505') {
              // Already exists - this is fine
              dbLevelDedupes++;
            }
          }
        } else {
          console.error('[process-upload] Insert batch error:', insertError);
          throw insertError;
        }
      } else if (insertedProps) {
        // Batch insert succeeded - update map and count
        for (const prop of insertedProps) {
          const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
          existingMap.set(key, prop.id);
          propertiesCreated++;
        }
      }

      // Update progress
      if ((i + batch.length) % 200 === 0 || i + batch.length >= newProperties.length) {
        await supabaseClient
          .from('upload_jobs')
          .update({ status: 'DEDUPING', processed_rows: i + batch.length })
          .eq('id', jobId);
        console.log(`[process-upload] Property insert progress: ${i + batch.length}/${newProperties.length}, created: ${propertiesCreated}, dupes: ${dbLevelDedupes}`);
      }
    }

    console.log(`[process-upload] Property creation complete: ${propertiesCreated} created, ${dbLevelDedupes} duplicates skipped`);

    // Now fetch all property IDs for this city in bulk - much faster than individual lookups
    // For county-scope: properties have city='unincorporated', for city-scope use job.city (lowercase)
    const lookupCity = isCountyScope ? 'unincorporated' : (job.city || '').toLowerCase();
    console.log(`[process-upload] Fetching all property IDs for mapping (city="${lookupCity}")...`);
    const { data: allCityProps, error: fetchError } = await supabaseClient
      .from('properties')
      .select('id, address, city, state, zip')
      .ilike('city', lookupCity)
      .eq('state', job.state || '')
      .limit(50000);

    if (fetchError) {
      console.error('[process-upload] Error fetching property IDs:', fetchError);
    } else {
      // Update existingMap with all properties for violation linking
      (allCityProps || []).forEach(prop => {
        const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
        if (!existingMap.has(key)) {
          existingMap.set(key, prop.id);
        }
      });
      console.log(`[process-upload] Mapped ${existingMap.size} total properties (${propertiesCreated} newly created, ${dbLevelDedupes} duplicates)`);
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
    // CRITICAL: Very small batch sizes to prevent Cloudflare/Supabase 500 errors during large uploads
    const STAGING_FETCH_BATCH = 100;   // REDUCED from 200 to prevent timeouts
    const VIOL_INSERT_BATCH = 15;      // REDUCED from 25 to prevent statement timeouts
    let stagingOffset = 0;
    let violationsCreatedTotal = 0;
    let skippedRows = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    console.log(`[process-upload] Starting violation creation (streaming batches of ${STAGING_FETCH_BATCH})...`);

    while (true) {
      // Fetch a batch of staging rows with retry logic
      let stagingBatch: any[] | null = null;
      let stagingError: any = null;
      
      for (let retryAttempt = 0; retryAttempt < 3; retryAttempt++) {
        const result = await supabaseClient
          .from('upload_staging')
          .select('*')
          .eq('job_id', jobId)
          .order('row_num')
          .range(stagingOffset, stagingOffset + STAGING_FETCH_BATCH - 1);
        
        stagingBatch = result.data;
        stagingError = result.error;
        
        if (!stagingError) break;
        
        console.warn(`[process-upload] Staging fetch retry ${retryAttempt + 1}/3:`, stagingError.message);
        await new Promise(r => setTimeout(r, 500 * (retryAttempt + 1))); // Exponential backoff
      }

      if (stagingError) {
        throw new Error(`Failed to fetch staging data after retries: ${stagingError.message}`);
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
        // For county-scope: staging has city=null, but properties have city='UNINCORPORATED'
        const city = row.city?.trim() || (isCountyScope ? 'UNINCORPORATED' : '');
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

      // Upsert this batch of violations using lifecycle-aware bulk function
      let violationsInserted = 0;
      let violationsUpdated = 0;
      
      for (let i = 0; i < violations.length; i += VIOL_INSERT_BATCH) {
        const upsertBatch = violations.slice(i, i + VIOL_INSERT_BATCH);
        let upsertSuccess = false;
        
        for (let retryAttempt = 0; retryAttempt < 3; retryAttempt++) {
          // Use bulk_upsert_violations RPC for lifecycle-aware processing
          const { data: upsertResult, error: violError } = await supabaseClient
            .rpc('bulk_upsert_violations', {
              p_violations: upsertBatch
            });

          if (!violError) {
            upsertSuccess = true;
            consecutiveErrors = 0; // Reset on success
            
            // Track lifecycle stats
            if (upsertResult) {
              violationsInserted += upsertResult.inserted || 0;
              violationsUpdated += upsertResult.updated || 0;
              console.log(`[process-upload] Upsert batch: ${upsertResult.inserted} new, ${upsertResult.updated} updated`);
            }
            break;
          }
          
          console.warn(`[process-upload] Violation upsert retry ${retryAttempt + 1}/3:`, violError.message);
          await new Promise(r => setTimeout(r, 500 * (retryAttempt + 1))); // Exponential backoff
        }

        if (!upsertSuccess) {
          consecutiveErrors++;
          console.error(`[process-upload] Failed to upsert batch after retries (consecutive errors: ${consecutiveErrors})`);
          
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            throw new Error(`Too many consecutive upsert failures (${consecutiveErrors}). Aborting.`);
          }
          continue; // Skip this batch but continue trying
        }

        violationsCreatedTotal += upsertBatch.length;
      }
      
      console.log(`[process-upload] Lifecycle stats: ${violationsInserted} inserted, ${violationsUpdated} updated`);

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
      
      // Small delay between batches to prevent rate limiting
      await new Promise(r => setTimeout(r, 50));
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

    // Build warnings array for data quality issues
    const warnings: string[] = [];
    if (skippedRows > 0) {
      warnings.push(`${skippedRows} violations could not be matched to properties (orphaned)`);
    }

    // Mark job complete FIRST - insights will run in background
    const { error: completeError } = await supabaseClient
      .from('upload_jobs')
      .update({
        status: 'COMPLETE',
        finished_at: new Date().toISOString(),
        properties_created: propertiesCreated,
        violations_created: violationsCreatedTotal,
        total_rows: totalRows,
        warnings: warnings.length > 0 ? warnings : null
      })
      .eq('id', jobId);
    
    if (completeError) {
      console.error('[process-upload] Failed to mark job complete:', completeError);
      throw new Error(`Failed to update job status: ${completeError.message}`);
    }

    console.log(`[process-upload] Job ${jobId} marked COMPLETE`);
    console.log(`[process-upload]   • Data quality: ${warnings.length} warning(s)`);

    // ===== GENERATE INSIGHTS IN BACKGROUND =====
    // Run insights asynchronously so upload completes faster
    if (allPropertyIds.length > 0) {
      console.log(`[process-upload] Triggering background insights generation for ${allPropertyIds.length} properties...`);
      
      EdgeRuntime.waitUntil(
        (async () => {
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
              const insightsGenerated = insightsData.processed || 0;
              const breakdown = insightsData.breakdown || {};
              console.log(`[process-upload] ✓ Background insights complete: ${insightsGenerated} properties`);
              console.log(`[process-upload]   - AI-generated: ${breakdown.ai_generated || 0}`);
              console.log(`[process-upload]   - Rule-based: ${breakdown.rule_based || 0}`);
              console.log(`[process-upload]   - No data: ${breakdown.no_data || 0}`);
            } else {
              const errorText = await insightsResponse.text();
              console.error(`[process-upload] ✗ Background insights failed: HTTP ${insightsResponse.status}`);
              console.error(`[process-upload] Response: ${errorText}`);
            }
          } catch (insightError) {
            console.error('[process-upload] ✗ Error during background insight generation:', insightError);
          }
        })()
      );
    } else {
      console.log('[process-upload] No properties created, skipping insight generation');
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
