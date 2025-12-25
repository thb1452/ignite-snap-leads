import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// AGGRESSIVE batching for faster processing - 83k+ properties to process
const BATCH_SIZE = 500; // Process 500 properties per invocation
const PARALLEL_REQUESTS = 50; // 50 concurrent geocoding requests
const CONTINUE_THRESHOLD = 100; // Auto-continue if more than 100 remaining

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodeRequest {
  jobId: string;
}

/**
 * Geocode a single address using Mapbox Geocoding API
 */
async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip?: string
): Promise<{ latitude: number | null; longitude: number | null; skipped: boolean }> {
  // STEP 1: Sanitize address - remove Windows line breaks, extra spaces, duplicate city names
  let cleanAddress = (address || '')
    .replace(/_X000D_/g, ' ')  // Remove Windows carriage returns
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();

  // Remove city name if it appears at the end of address (common CSV issue)
  const cityUpper = (city || '').toUpperCase().trim();
  if (cityUpper && cleanAddress.toUpperCase().endsWith(cityUpper)) {
    cleanAddress = cleanAddress.slice(0, -cityUpper.length).trim();
  }

  // STEP 2: Validate address components
  const addressLower = cleanAddress.toLowerCase();
  const cityLower = (city || '').trim().toLowerCase();

  // Basic validation: missing data or known placeholders
  if (!cleanAddress || addressLower === 'unknown' ||
      !city || cityLower === 'unknown' || !state) {
    console.log(`[Geocoding SKIP] Missing or unknown address data: ${cleanAddress}`);
    return { latitude: null, longitude: null, skipped: true };
  }

  // Length checks - addresses should be reasonable length
  if (cleanAddress.length > 100 || cleanAddress.length < 5) {
    console.log(`[Geocoding SKIP] Address length invalid (${cleanAddress.length} chars): ${cleanAddress.substring(0, 50)}...`);
    return { latitude: null, longitude: null, skipped: true };
  }

  // STEP 3: Skip parcel-based locations and violation text
  const invalidPatterns = [
    'parcel-based location', 'parcel-based', 'parked on',
    'violation', 'debris', 'trash', 'weeds', 'overgrown',
    'complaint', 'notice', 'hazard', 'illegal', 'unpermitted',
    'junk', 'abandoned', 'dumped', 'received a call',
    'regarding', 'neighbor', 'the city of'
  ];

  const hasInvalidPattern = invalidPatterns.some(p => addressLower.includes(p) || cityLower.includes(p));
  if (hasInvalidPattern) {
    console.log(`[Geocoding SKIP] Address contains invalid text: ${cleanAddress.substring(0, 50)}...`);
    return { latitude: null, longitude: null, skipped: true };
  }

  // STEP 4: Skip if address looks malformed (e.g. contains multiple sentences, excessive punctuation)
  if (cleanAddress.includes(';') || cleanAddress.split('.').length > 2) {
    console.log(`[Geocoding SKIP] Address appears malformed: ${cleanAddress}`);
    return { latitude: null, longitude: null, skipped: true };
  }

  console.log(`[Geocoding] ${cleanAddress}, ${city}, ${state}`);

  // STEP 5: Check for Mapbox API token
  const MAPBOX_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
  if (!MAPBOX_TOKEN) {
    console.error('[Geocoding] ⚠️ MAPBOX_ACCESS_TOKEN not configured - skipping all geocoding');
    return { latitude: null, longitude: null, skipped: true };  // FIX: Mark as skipped, not failed
  }

  // STEP 6: Build full address and call Mapbox
  const cleanCity = city.trim();
  const cleanState = state.trim();
  const addressParts = [cleanAddress, cleanCity, cleanState];
  if (zip && zip.trim() && zip !== '00000') {
    addressParts.push(zip.trim());
  }
  const fullAddress = addressParts.join(', ');

  try {
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`;

    const response = await fetch(mapboxUrl, {
      signal: AbortSignal.timeout(5000) // 5 second timeout - fail fast
    });

    if (!response.ok) {
      console.error(`[Mapbox FAIL] ${fullAddress}: HTTP ${response.status}`);
      return { latitude: null, longitude: null, skipped: false };
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      console.log(`✓ Geocoded: ${fullAddress} -> ${lat}, ${lng}`);
      return { latitude: lat, longitude: lng, skipped: false };
    }

    console.log(`[Mapbox FAIL] ${fullAddress}: No results`);
    return { latitude: null, longitude: null, skipped: false };

  } catch (error) {
    console.error(`[Mapbox ERROR] ${fullAddress}:`, {
      error: error instanceof Error ? error.message : String(error),
      type: error?.name
    });
    return { latitude: null, longitude: null, skipped: false };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { jobId } = body;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get job
    const { data: job, error: jobError } = await supabase
      .from("geocoding_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("[Geocoding] Job not found", jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch properties that need geocoding (null coords)
    // We exclude properties where latitude = 0 (which means they were already processed but skipped/failed)
    // NOTE: We need to handle NULL properly - NULL != 0 returns NULL in SQL, not true
    const { data: properties, error: propsError } = await supabase
      .from("properties")
      .select("id,address,city,state,zip,latitude,longitude")
      .is("latitude", null)  // Only get properties where latitude IS NULL
      .limit(BATCH_SIZE);

    if (propsError) throw propsError;

    if (!properties || properties.length === 0) {
      // Nothing left to process
      return new Response(
        JSON.stringify({ remaining: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Geocoding] Processing ${properties.length} properties in parallel (${PARALLEL_REQUESTS} concurrent)`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    // Process properties in parallel batches
    const successUpdates: Array<{ id: string; latitude: number; longitude: number }> = [];
    const skippedIds: string[] = [];  // Track skipped properties to mark them

    for (let i = 0; i < properties.length; i += PARALLEL_REQUESTS) {
      const chunk = properties.slice(i, i + PARALLEL_REQUESTS);

      const results = await Promise.allSettled(
        chunk.map(prop => geocodeAddress(prop.address, prop.city, prop.state, prop.zip)
          .then(result => ({ propertyId: prop.id, ...result })))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];

        if (result.status === 'fulfilled') {
          const { propertyId, latitude, longitude, skipped } = result.value;

          if (skipped) {
            skippedIds.push(propertyId);  // Mark for update so they don't get reprocessed
            skippedCount++;
          } else if (latitude != null && longitude != null) {
            successUpdates.push({ id: propertyId, latitude, longitude });
            successCount++;
          } else {
            // Failed geocode - also mark so we don't keep retrying
            skippedIds.push(propertyId);
            failCount++;
          }
        } else {
          console.error('[Geocoding] Promise rejected:', result.reason);
          failCount++;
        }
      }

      console.log(`[Geocoding] Processed ${Math.min(i + PARALLEL_REQUESTS, properties.length)}/${properties.length}`);
    }

    // Batch update successful geocodes
    if (successUpdates.length > 0) {
      console.log(`[Geocoding] Batch updating ${successUpdates.length} successful geocodes`);

      for (const update of successUpdates) {
        const { error: updateError } = await supabase
          .from("properties")
          .update({
            latitude: update.latitude,
            longitude: update.longitude,
            geom: `POINT(${update.longitude} ${update.latitude})`
          })
          .eq("id", update.id);

        if (updateError) {
          console.error("[Geocoding] Failed to update property", update.id, updateError);
          successCount--;
          failCount++;
        }
      }
    }

    // CRITICAL FIX: Mark skipped/failed properties with 0,0 coords so they don't get reprocessed
    // This prevents the infinite loop where ungeocodable properties are processed forever
    if (skippedIds.length > 0) {
      console.log(`[Geocoding] Marking ${skippedIds.length} skipped/failed properties as processed`);
      
      // Update in batches of 50 to avoid timeouts
      for (let i = 0; i < skippedIds.length; i += 50) {
        const batch = skippedIds.slice(i, i + 50);
        const { error: skipError } = await supabase
          .from("properties")
          .update({
            latitude: 0,
            longitude: 0,
            // Don't set geom for 0,0 - leave it null to indicate not geocoded
          })
          .in("id", batch);

        if (skipError) {
          console.error("[Geocoding] Failed to mark skipped properties", skipError);
        }
      }
    }

    // Update job counters
    const { error: jobUpdateError } = await supabase
      .from("geocoding_jobs")
      .update({
        geocoded_count: (job.geocoded_count || 0) + successCount,
        failed_count: (job.failed_count || 0) + failCount,
        skipped_count: (job.skipped_count || 0) + skippedCount,  // Track parcel-based locations separately
      })
      .eq("id", jobId);

    if (jobUpdateError) {
      console.error("[Geocoding] Failed updating job counters", jobUpdateError);
    }

    // How many still remain? (only count NULL latitudes)
    const { count: remaining, error: remainingError } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("latitude", null);

    if (remainingError) throw remainingError;

    console.log(`[BATCH COMPLETE]`, {
      succeeded: successCount,
      failed: failCount,
      skipped: skippedCount,
      total: properties.length,
      remaining: remaining ?? 0,
      successRate: `${Math.round((successCount / properties.length) * 100)}%`,
      failureRate: `${Math.round((failCount / properties.length) * 100)}%`,
      skipRate: `${Math.round((skippedCount / properties.length) * 100)}%`,
    });

    if (skippedCount > 0) {
      console.log(`[Geocoding] ℹ️ ${skippedCount} properties skipped (parcel-based locations with no real address)`);
    }

    // Auto-continue if many properties remain (background processing)
    if ((remaining ?? 0) > CONTINUE_THRESHOLD) {
      console.log(`[Geocoding] 🔄 ${remaining} properties remaining - auto-continuing in background...`);
      
      // Queue the next batch using waitUntil for background processing
      const selfInvokePromise = (async () => {
        try {
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const nextResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/geocode-properties`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ jobId }),
            }
          );
          console.log(`[Geocoding] Next batch triggered: ${nextResponse.status}`);
        } catch (err) {
          console.error('[Geocoding] Failed to trigger next batch:', err);
        }
      })();
      
      // @ts-ignore - EdgeRuntime.waitUntil is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(selfInvokePromise);
      }
    }

    return new Response(
      JSON.stringify({ remaining: remaining ?? 0, processed: properties.length, success: successCount, failed: failCount, skipped: skippedCount }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    // Better error logging
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
      raw: JSON.stringify(error)
    };
    console.error("[Geocoding] Edge function error:", errorDetails);

    return new Response(
      JSON.stringify({
        error: errorDetails.message || "Unknown error",
        details: errorDetails
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
