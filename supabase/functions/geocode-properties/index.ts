import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const BATCH_SIZE = 100; // Process more properties per invocation
const PARALLEL_REQUESTS = 10; // Number of concurrent geocoding requests

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
  console.log(`[Geocoding START] ${address}, ${city}, ${state} ${zip || ''}`);

  // Validate address components
  const addressLower = address?.trim().toLowerCase() || '';
  const cityLower = city?.trim().toLowerCase() || '';

  if (!address || addressLower === 'unknown' ||
      !city || cityLower === 'unknown' || !state ||
      addressLower.startsWith('parcel-based location')) {
    console.log(`[Geocoding SKIP] Invalid or parcel-based address: ${address}`);
    return { latitude: null, longitude: null, skipped: true };
  }

  const MAPBOX_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
  if (!MAPBOX_TOKEN) {
    console.error('[Geocoding] MAPBOX_ACCESS_TOKEN not configured');
    return { latitude: null, longitude: null, skipped: false };
  }

  // Build full address
  const cleanAddress = address.trim();
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

    // Fetch a batch of properties that still need geocoding
    const { data: properties, error: propsError } = await supabase
      .from("properties")
      .select("id,address,city,state,zip,latitude,longitude")
      .or("latitude.is.null,longitude.is.null")
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
    const updates: Array<{ id: string; latitude: number; longitude: number }> = [];

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
            skippedCount++;
          } else if (latitude != null && longitude != null) {
            updates.push({ id: propertyId, latitude, longitude });
            successCount++;
          } else {
            failCount++;
          }
        } else {
          console.error('[Geocoding] Promise rejected:', result.reason);
          failCount++;
        }
      }

      console.log(`[Geocoding] Processed ${Math.min(i + PARALLEL_REQUESTS, properties.length)}/${properties.length}`);
    }

    // Batch update all successful geocodes
    if (updates.length > 0) {
      console.log(`[Geocoding] Batch updating ${updates.length} properties`);

      for (const update of updates) {
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

    // How many still remain?
    const { count: remaining, error: remainingError } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .or("latitude.is.null,longitude.is.null");

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

    return new Response(
      JSON.stringify({ remaining: remaining ?? 0 }),
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
