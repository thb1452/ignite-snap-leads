import { createClient } from 'jsr:@supabase/supabase-js@2';

const BATCH_SIZE = 20; // Reduced to avoid API rate limits

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodeRequest {
  jobId: string;
}

/**
 * Geocode a single address using Census API first, then Nominatim fallback
 */
async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip?: string
): Promise<{ latitude: number | null; longitude: number | null }> {
  // Validate address components
  if (!address || address.trim().toLowerCase() === 'unknown' || 
      !city || city.trim().toLowerCase() === 'unknown' || !state) {
    return { latitude: null, longitude: null };
  }

  // Clean address
  const cleanAddress = address.trim().replace(/\s+-\s*[A-Z](?:\s|$)/g, ' ').replace(/\s+/g, ' ');
  const cleanCity = city.trim();
  const cleanState = state.trim();

  // Build full address
  const addressParts = [cleanAddress, cleanCity, cleanState];
  if (zip && zip.trim() && zip !== '00000') {
    addressParts.push(zip.trim());
  }
  const fullAddress = addressParts.join(', ');

  // Try Census geocoder first (US addresses) with longer timeout
  try {
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(fullAddress)}&benchmark=Public_AR_Current&format=json`;
    const censusRes = await fetch(censusUrl, { signal: AbortSignal.timeout(10000) });
    
    if (censusRes.ok) {
      const censusData = await censusRes.json();
      if (censusData.result?.addressMatches && censusData.result.addressMatches.length > 0) {
        const match = censusData.result.addressMatches[0];
        const coords = match.coordinates;
        if (coords && coords.x && coords.y) {
          return { latitude: coords.y, longitude: coords.x };
        }
      }
    }
  } catch (censusError) {
    console.log(`Census API error: ${censusError.message}`);
  }

  // Fallback to Nominatim with better error handling
  try {
    await new Promise(resolve => setTimeout(resolve, 1200)); // Rate limit

    // Try only the most specific variation first to fail fast
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`;
    
    const nomRes = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'SnapIgnite/1.0' },
      signal: AbortSignal.timeout(10000) // Increased to 10 seconds
    });

    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (nomData.length > 0) {
        const lat = parseFloat(nomData[0].lat);
        const lng = parseFloat(nomData[0].lon);
        
        if (lat && lng && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
    }
  } catch (nomError) {
    // Only log non-timeout errors
    if (!nomError.message.includes('timed out')) {
      console.log(`Nominatim API error: ${nomError.message}`);
    }
  }

  return { latitude: null, longitude: null };
}

Deno.serve(async (req: Request) => {
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
    let consecutiveTimeouts = 0;

    for (const property of properties) {
      // If we hit too many consecutive timeouts, slow down dramatically
      if (consecutiveTimeouts >= 5) {
        console.log(`⚠️ Too many timeouts, adding longer delay...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        consecutiveTimeouts = 0;
      }

      try {
        const { latitude, longitude } = await geocodeAddress(
          property.address,
          property.city,
          property.state,
          property.zip
        );

        if (latitude == null || longitude == null) {
          // Track if this was a timeout vs invalid address
          if (property.address.toLowerCase().includes('unknown')) {
            failCount++;
          } else {
            failCount++;
            consecutiveTimeouts++;
          }
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
          console.log(`✓ Geocoded: ${property.address}`);
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

    console.log(`[Geocoding] Batch complete: ${successCount} succeeded, ${failCount} failed, ${remaining ?? 0} remaining`);

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
