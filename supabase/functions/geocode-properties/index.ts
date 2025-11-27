import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const BATCH_SIZE = 50; // Increased - Mapbox handles this well

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
): Promise<{ latitude: number | null; longitude: number | null }> {
  console.log(`[Geocoding START] ${address}, ${city}, ${state} ${zip || ''}`);
  
  // Validate address components
  if (!address || address.trim().toLowerCase() === 'unknown' || 
      !city || city.trim().toLowerCase() === 'unknown' || !state) {
    console.log(`[Geocoding SKIP] Invalid address components`);
    return { latitude: null, longitude: null };
  }

  const MAPBOX_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
  if (!MAPBOX_TOKEN) {
    console.error('[Geocoding] MAPBOX_ACCESS_TOKEN not configured');
    return { latitude: null, longitude: null };
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
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`[Mapbox FAIL] ${fullAddress}: HTTP ${response.status}`);
      return { latitude: null, longitude: null };
    }

    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      console.log(`✓ Geocoded: ${fullAddress} -> ${lat}, ${lng}`);
      return { latitude: lat, longitude: lng };
    }

    console.log(`[Mapbox FAIL] ${fullAddress}: No results`);
    return { latitude: null, longitude: null };

  } catch (error) {
    console.error(`[Mapbox ERROR] ${fullAddress}:`, {
      error: error instanceof Error ? error.message : String(error),
      type: error?.name
    });
    return { latitude: null, longitude: null };
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

    console.log(`[Geocoding] Processing ${properties.length} properties for job ${jobId}`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    let consecutiveTimeouts = 0;

    for (const property of properties) {
      // If we hit too many consecutive timeouts, skip rest to avoid wasting time
      if (consecutiveTimeouts >= 3) {
        console.log(`⚠️ Too many timeouts (${consecutiveTimeouts}), skipping remaining ${properties.length - properties.indexOf(property)} in batch`);
        skippedCount = properties.length - properties.indexOf(property);
        failCount += skippedCount;
        break;
      }

      try {
        const { latitude, longitude } = await geocodeAddress(
          property.address,
          property.city,
          property.state,
          property.zip
        );

        if (latitude == null || longitude == null) {
          failCount++;
          consecutiveTimeouts++;
          continue;
        }

        // Success - reset timeout counter
        consecutiveTimeouts = 0;

        const { error: updateError } = await supabase
          .from("properties")
          .update({ 
            latitude, 
            longitude,
            geom: `POINT(${longitude} ${latitude})`
          })
          .eq("id", property.id);

        if (updateError) {
          console.error("[Geocoding] Failed to update property", property.id, updateError);
          failCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error("[Geocoding] Error geocoding property", property.id, err);
        failCount++;
        consecutiveTimeouts++;
      }
    }

    // Update job counters
    const { error: jobUpdateError } = await supabase
      .from("geocoding_jobs")
      .update({
        geocoded_count: (job.geocoded_count || 0) + successCount,
        failed_count: (job.failed_count || 0) + failCount,
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
      failureRate: `${Math.round((failCount / properties.length) * 100)}%`
    });

    return new Response(
      JSON.stringify({ remaining: remaining ?? 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("[Geocoding] Edge function error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
