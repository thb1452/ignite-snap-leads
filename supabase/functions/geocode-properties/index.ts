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

    // Process properties individually with Census API
    for (const prop of properties) {
      try {
        // Build address string (only include ZIP if it exists)
        const addressParts = [prop.address, prop.city, prop.state];
        if (prop.zip && prop.zip.trim()) {
          addressParts.push(prop.zip);
        }
        const fullAddress = addressParts.join(', ');
        
        console.log(`Geocoding: ${fullAddress}`);
        
        // Try Census geocoder API first
        const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(fullAddress)}&benchmark=Public_AR_Current&format=json`;
        
        const censusRes = await fetch(censusUrl);
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
              
              geocoded++;
              continue;
            }
          }
        }
        
        // Fallback to Nominatim
        await new Promise(resolve => setTimeout(resolve, 1100)); // Rate limit
        
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${prop.address}, ${prop.city}, ${prop.state}, USA`)}`;
        const nomRes = await fetch(nominatimUrl, {
          headers: { 'User-Agent': 'SnapIgnite/1.0' }
        });

        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (nomData.length > 0) {
            const lat = parseFloat(nomData[0].lat);
            const lng = parseFloat(nomData[0].lon);
            
            await supabase
              .from('properties')
              .update({ 
                latitude: lat, 
                longitude: lng,
                geom: `POINT(${lng} ${lat})`
              })
              .eq('id', prop.id);
            
            geocoded++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      } catch (e) {
        console.error(`Geocoding failed for ${prop.id}:`, e);
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
      // More properties to process - keep job running
      await supabase
        .from('geocoding_jobs')
        .update({ 
          geocoded_count: newGeocodedCount,
          failed_count: newFailedCount
        })
        .eq('id', jobId);
      
      console.log(`Batch complete: ${geocoded} geocoded this batch (${newGeocodedCount} total), ${failed} failed this batch (${newFailedCount} total), ${remainingCount} remaining`);
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