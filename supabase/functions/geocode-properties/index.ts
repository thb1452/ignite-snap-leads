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

    // Update job to running
    await supabase
      .from('geocoding_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId);

    // Get properties that need geocoding
    const { data: properties, error: fetchError } = await supabase
      .from('properties')
      .select('id, address, city, state, zip')
      .or('latitude.is.null,longitude.is.null')
      .limit(500); // Process max 500 at a time

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

    // Update total count
    await supabase
      .from('geocoding_jobs')
      .update({ total_properties: properties.length })
      .eq('id', jobId);

    let geocoded = 0;
    let failed = 0;

    // Process in batches of 50 for Census API
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < properties.length; i += BATCH_SIZE) {
      const batch = properties.slice(i, i + BATCH_SIZE);
      
      try {
        // Try Census batch geocoder first (US only)
        const censusBatch = batch.map((p, idx) => ({
          id: idx,
          address: p.address,
          city: p.city,
          state: p.state,
          zip: p.zip || ''
        }));

        const censusUrl = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
        const formData = new FormData();
        const csvContent = censusBatch.map(p => 
          `${p.id},"${p.address}","${p.city}","${p.state}","${p.zip}"`
        ).join('\n');
        
        formData.append('addressFile', new Blob([csvContent], { type: 'text/csv' }), 'addresses.csv');
        formData.append('benchmark', 'Public_AR_Current');

        const censusRes = await fetch(censusUrl, {
          method: 'POST',
          body: formData
        });

        if (censusRes.ok) {
          const censusText = await censusRes.text();
          const lines = censusText.trim().split('\n');
          
          // Parse Census response (CSV format: id,address,match,exact,coordinates,...)
          const updates = [];
          const failedIds = new Set(batch.map(p => p.id));

          for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 5 && parts[2] === 'Match') {
              const idx = parseInt(parts[0]);
              const coords = parts[4].replace(/["\s]/g, '').split(',');
              if (coords.length === 2) {
                const lng = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                  updates.push({
                    id: batch[idx].id,
                    latitude: lat,
                    longitude: lng,
                    geom: `POINT(${lng} ${lat})`
                  });
                  failedIds.delete(batch[idx].id);
                  geocoded++;
                }
              }
            }
          }

          // Update successful geocodes
          for (const update of updates) {
            await supabase
              .from('properties')
              .update({ 
                latitude: update.latitude, 
                longitude: update.longitude,
                geom: update.geom
              })
              .eq('id', update.id);
          }

          // Fallback to Nominatim for failed ones
          for (const prop of batch) {
            if (failedIds.has(prop.id)) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit

              const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${prop.address}, ${prop.city}, ${prop.state}, USA`)}`;
              
              try {
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
                console.error(`Nominatim failed for ${prop.id}:`, e);
                failed++;
              }
            }
          }
        } else {
          // Census failed, fallback to Nominatim for entire batch
          for (const prop of batch) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
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
        }
      } catch (batchError) {
        console.error('Batch processing error:', batchError);
        failed += batch.length;
      }

      // Update progress
      await supabase
        .from('geocoding_jobs')
        .update({ 
          geocoded_count: geocoded,
          failed_count: failed
        })
        .eq('id', jobId);
    }

    // Mark job as completed
    await supabase
      .from('geocoding_jobs')
      .update({ 
        status: 'completed',
        finished_at: new Date().toISOString(),
        geocoded_count: geocoded,
        failed_count: failed
      })
      .eq('id', jobId);

    return new Response(
      JSON.stringify({ success: true, geocoded, failed, total: properties.length }),
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