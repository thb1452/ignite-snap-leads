import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

// Batch settings - Census API is rate-limited
const BATCH_SIZE = 500; // Properties per invocation
const PARALLEL_REQUESTS = 25; // Concurrent requests
const CONTINUE_THRESHOLD = 100; // Auto-continue if more remaining

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Reverse geocode coordinates to get zip code using FREE US Census Geocoder API
 * https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
 * 
 * Uses the geographies/coordinates endpoint which returns ZCTA (ZIP Code Tabulation Area)
 */
async function reverseGeocodeForZip(
  latitude: number,
  longitude: number
): Promise<{ zip: string | null; error?: string }> {
  // Validate coordinates are in US range
  if (latitude < 24 || latitude > 50 || longitude < -125 || longitude > -66) {
    return { zip: null, error: 'Coordinates outside US' };
  }

  // Skip 0,0 coordinates (marked as failed/skipped in forward geocoding)
  if (latitude === 0 && longitude === 0) {
    return { zip: null, error: 'Zero coordinates' };
  }

  try {
    // Census Geocoder reverse geocoding endpoint
    // Returns geography info including ZIP Code Tabulation Areas (ZCTA)
    const censusUrl = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates');
    censusUrl.searchParams.set('x', longitude.toString());
    censusUrl.searchParams.set('y', latitude.toString());
    censusUrl.searchParams.set('benchmark', 'Public_AR_Current');
    censusUrl.searchParams.set('vintage', 'Current_Current');
    censusUrl.searchParams.set('layers', '2020 Census ZIP Code Tabulation Areas');
    censusUrl.searchParams.set('format', 'json');

    const response = await fetch(censusUrl.toString(), {
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    if (!response.ok) {
      console.error(`[Reverse FAIL] ${latitude},${longitude}: HTTP ${response.status}`);
      return { zip: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    // Extract ZIP from geographies
    const geographies = data.result?.geographies;
    if (geographies) {
      // Look for ZCTA (ZIP Code Tabulation Areas)
      const zcta = geographies['2020 Census ZIP Code Tabulation Areas'];
      if (zcta && zcta.length > 0) {
        const zipCode = zcta[0].ZCTA5CE20 || zcta[0].GEOID;
        if (zipCode && /^\d{5}$/.test(zipCode)) {
          console.log(`✓ Reverse geocoded: ${latitude},${longitude} -> ${zipCode}`);
          return { zip: zipCode };
        }
      }
    }

    console.log(`[Reverse FAIL] ${latitude},${longitude}: No ZCTA found`);
    return { zip: null, error: 'No ZCTA found' };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Reverse ERROR] ${latitude},${longitude}: ${errMsg}`);
    return { zip: null, error: errMsg };
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

    // Get properties that have coordinates but missing zip
    const { data: properties, error: propsError } = await supabase
      .from("properties")
      .select("id,latitude,longitude")
      .or("zip.is.null,zip.eq.")
      .not("latitude", "is", null)
      .neq("latitude", 0)
      .limit(BATCH_SIZE);

    if (propsError) throw propsError;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No more properties to process",
          remaining: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Reverse Geocoding] Processing ${properties.length} properties (${PARALLEL_REQUESTS} concurrent)`);

    let successCount = 0;
    let failCount = 0;
    const updates: Array<{ id: string; zip: string }> = [];

    // Process in parallel batches
    for (let i = 0; i < properties.length; i += PARALLEL_REQUESTS) {
      const chunk = properties.slice(i, i + PARALLEL_REQUESTS);

      const results = await Promise.allSettled(
        chunk.map(prop => 
          reverseGeocodeForZip(Number(prop.latitude), Number(prop.longitude))
            .then(result => ({ propertyId: prop.id, ...result }))
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { propertyId, zip, error } = result.value;
          if (zip) {
            updates.push({ id: propertyId, zip });
            successCount++;
          } else {
            failCount++;
          }
        } else {
          console.error('[Reverse] Promise rejected:', result.reason);
          failCount++;
        }
      }

      console.log(`[Reverse Geocoding] Processed ${Math.min(i + PARALLEL_REQUESTS, properties.length)}/${properties.length}`);
      
      // Small delay between batches to be nice to Census API
      if (i + PARALLEL_REQUESTS < properties.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Batch update successful zip codes
    if (updates.length > 0) {
      console.log(`[Reverse Geocoding] Updating ${updates.length} properties with zip codes`);

      for (const update of updates) {
        const { error: updateError } = await supabase
          .from("properties")
          .update({ zip: update.zip })
          .eq("id", update.id);

        if (updateError) {
          console.error("[Reverse] Failed to update property", update.id, updateError);
          successCount--;
          failCount++;
        }
      }
    }

    // Count remaining
    const { count: remaining, error: remainingError } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .or("zip.is.null,zip.eq.")
      .not("latitude", "is", null)
      .neq("latitude", 0);

    if (remainingError) throw remainingError;

    console.log(`[BATCH COMPLETE]`, {
      succeeded: successCount,
      failed: failCount,
      total: properties.length,
      remaining: remaining ?? 0,
      successRate: `${Math.round((successCount / properties.length) * 100)}%`,
    });

    // Auto-continue if many properties remain
    if ((remaining ?? 0) > CONTINUE_THRESHOLD) {
      console.log(`[Reverse Geocoding] 🔄 ${remaining} properties remaining - auto-continuing...`);
      
      const selfInvokePromise = (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const nextResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/reverse-geocode-zips`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            }
          );
          console.log(`[Reverse Geocoding] Next batch triggered: ${nextResponse.status}`);
        } catch (err) {
          console.error('[Reverse Geocoding] Failed to trigger next batch:', err);
        }
      })();
      
      if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime.waitUntil) {
        (globalThis as any).EdgeRuntime.waitUntil(selfInvokePromise);
      }
    }

    return new Response(
      JSON.stringify({ 
        remaining: remaining ?? 0, 
        processed: properties.length, 
        success: successCount, 
        failed: failCount 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
    };
    console.error("[Reverse Geocoding] Error:", errorDetails);

    return new Response(
      JSON.stringify({ error: errorDetails.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
