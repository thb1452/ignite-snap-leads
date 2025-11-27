import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodeRequest {
  jobId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { jobId } = await req.json() as GeocodeRequest;

    // Get current job state
    const { data: currentJob } = await supabase
      .from('geocoding_jobs')
      .select('geocoded_count, failed_count, status')
      .eq('id', jobId)
      .single();

    // Update job to running if not already
    if (currentJob?.status !== 'running') {
      await supabase
        .from('geocoding_jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    // Get properties that need geocoding (limit to batches of 50 to avoid timeout)
    const { data: properties, error: fetchError } = await supabase
      .from('properties')
      .select('id, address, city, state, zip')
      .or('latitude.is.null,longitude.is.null')
      .limit(50);

    if (fetchError) throw fetchError;

    if (!properties || properties.length === 0) {
      await supabase
        .from('geocoding_jobs')
        .update({ 
          status: 'completed', 
          finished_at: new Date().toISOString(),
          total_properties: 0
        })
        .eq('id', jobId);

      return new Response(JSON.stringify({ success: true, geocoded: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Processing ${properties.length} properties for job ${jobId}`);

    let geocoded = 0;
    let failed = 0;

    // Process properties individually with better validation and error handling
    for (const prop of properties) {
      try {
        // Validate address components
        if (!prop.address || 
            prop.address.trim().toLowerCase() === 'unknown' || 
            prop.address.trim() === '' ||
            !prop.city || 
            prop.city.trim().toLowerCase() === 'unknown' ||
            !prop.state) {
          console.log(`Skipping invalid address: ${prop.address}, ${prop.city}, ${prop.state}`);
          failed++;
          continue;
        }

        // Clean and normalize address components
        const cleanAddress = prop.address.trim()
          .replace(/\s+-\s*[A-Z](?:\s|$)/g, ' ') // Remove suffixes like " -A", " -B"
          .replace(/\s+/g, ' ');
        
        const cleanCity = prop.city.trim();
        const cleanState = prop.state.trim();
        
        // Build address string
        const addressParts = [cleanAddress, cleanCity, cleanState];
        if (prop.zip && prop.zip.trim() && prop.zip !== '00000') {
          addressParts.push(prop.zip.trim());
        }
        const fullAddress = addressParts.join(', ');
        
        console.log(`Geocoding: ${fullAddress}`);
        
        let geocodingSuccess = false;
        
        // Try Census geocoder API first (US addresses)
        try {
          const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(fullAddress)}&benchmark=Public_AR_Current&format=json`;
          
          const censusRes = await fetch(censusUrl, { signal: AbortSignal.timeout(5000) });
          if (censusRes.ok) {
            const censusData = await censusRes.json();
            
            if (censusData.result?.addressMatches && censusData.result.addressMatches.length > 0) {
              const match = censusData.result.addressMatches[0];
              const coords = match.coordinates;
              
              if (coords && coords.x && coords.y) {
                await supabase
                  .from('properties')
                  .update({ 
                    latitude: coords.y, 
                    longitude: coords.x,
                    geom: `POINT(${coords.x} ${coords.y})`
                  })
                  .eq('id', prop.id);
                
                console.log(`✓ Census geocoded: ${cleanAddress}`);
                geocoded++;
                geocodingSuccess = true;
                continue;
              }
            }
          }
        } catch (censusError) {
          console.log(`Census API error for ${cleanAddress}: ${censusError.message}`);
        }
        
        // If Census failed, try Nominatim
        if (!geocodingSuccess) {
          await new Promise(resolve => setTimeout(resolve, 1100)); // Rate limit
          
          try {
            // Try multiple address formats for better coverage
            const addressVariations = [
              `${cleanAddress}, ${cleanCity}, ${cleanState}, USA`,
              `${cleanAddress}, ${cleanCity}, ${cleanState}`,
              `${cleanCity}, ${cleanState}, USA`
            ];
            
            for (const addressVariation of addressVariations) {
              const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressVariation)}&limit=1`;
              const nomRes = await fetch(nominatimUrl, {
                headers: { 'User-Agent': 'SnapIgnite/1.0' },
                signal: AbortSignal.timeout(5000)
              });

              if (nomRes.ok) {
                const nomData = await nomRes.json();
                if (nomData.length > 0) {
                  const lat = parseFloat(nomData[0].lat);
                  const lng = parseFloat(nomData[0].lon);
                  
                  // Basic validation of coordinates (must be in reasonable range)
                  if (lat && lng && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    await supabase
                      .from('properties')
                      .update({ 
                        latitude: lat, 
                        longitude: lng,
                        geom: `POINT(${lng} ${lat})`
                      })
                      .eq('id', prop.id);
                    
                    console.log(`✓ Nominatim geocoded: ${cleanAddress} (using: ${addressVariation})`);
                    geocoded++;
                    geocodingSuccess = true;
                    break;
                  }
                }
              }
              
              // Small delay between variations
              if (!geocodingSuccess) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          } catch (nomError) {
            console.log(`Nominatim API error for ${cleanAddress}: ${nomError.message}`);
          }
        }
        
        if (!geocodingSuccess) {
          console.log(`✗ Failed to geocode: ${fullAddress}`);
          failed++;
        }
        
      } catch (e) {
        console.error(`Geocoding error for property ${prop.id}:`, e);
        failed++;
      }
    }

    // Check if there are more properties to process
    const { count: remainingCount } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .or('latitude.is.null,longitude.is.null');

    // Update job progress (accumulate counts)
    const newGeocodedCount = (currentJob?.geocoded_count || 0) + geocoded;
    const newFailedCount = (currentJob?.failed_count || 0) + failed;
    
    if (remainingCount && remainingCount > 0) {
      // More properties to process - keep job running and trigger next batch
      await supabase
        .from('geocoding_jobs')
        .update({ 
          geocoded_count: newGeocodedCount,
          failed_count: newFailedCount
        })
        .eq('id', jobId);
      
      console.log(`Batch complete: ${geocoded} geocoded this batch (${newGeocodedCount} total), ${failed} failed this batch (${newFailedCount} total), ${remainingCount} remaining`);
      
      // Trigger next batch in background
      EdgeRuntime.waitUntil(
        (async () => {
          // Wait a bit before next batch to avoid overwhelming APIs
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/geocode-properties`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ jobId }),
            });
          } catch (error) {
            console.error('Failed to trigger next batch:', error);
          }
        })()
      );
    } else {
      // All done
      await supabase
        .from('geocoding_jobs')
        .update({ 
          status: 'completed',
          finished_at: new Date().toISOString(),
          geocoded_count: newGeocodedCount,
          failed_count: newFailedCount
        })
        .eq('id', jobId);
      
      console.log(`Job complete: ${newGeocodedCount} total geocoded, ${newFailedCount} total failed`);
    }

    return new Response(
      JSON.stringify({ success: true, geocoded, failed, remaining: remainingCount || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Geocoding error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});