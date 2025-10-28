import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit delay between requests (1 second per Nominatim usage policy)
const RATE_LIMIT_MS = 1000;

async function geocodeAddress(address: string, city: string, state: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  const query = `${address}, ${city}, ${state} ${zip}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SnapIgnite-LeadApp/1.0'
      }
    });
    
    if (!response.ok) {
      console.error(`Geocoding failed for ${query}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error geocoding ${query}:`, error);
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { propertyIds } = await req.json();
    
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "propertyIds array is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch properties without coordinates
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id, address, city, state, zip, latitude, longitude")
      .in("id", propertyIds)
      .or("latitude.is.null,longitude.is.null");

    if (fetchError) {
      console.error("Error fetching properties:", fetchError);
      throw fetchError;
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ success: true, geocoded: 0, message: "No properties need geocoding" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let successCount = 0;
    let failCount = 0;

    // Process properties one at a time with rate limiting
    for (const property of properties) {
      const coords = await geocodeAddress(
        property.address,
        property.city,
        property.state,
        property.zip
      );

      if (coords) {
        const { error: updateError } = await supabase
          .from("properties")
          .update({
            latitude: coords.lat,
            longitude: coords.lng,
          })
          .eq("id", property.id);

        if (updateError) {
          console.error(`Error updating property ${property.id}:`, updateError);
          failCount++;
        } else {
          successCount++;
        }
      } else {
        failCount++;
      }

      // Rate limit between requests
      if (properties.indexOf(property) < properties.length - 1) {
        await delay(RATE_LIMIT_MS);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        geocoded: successCount,
        failed: failCount,
        total: properties.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in geocode-properties:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
