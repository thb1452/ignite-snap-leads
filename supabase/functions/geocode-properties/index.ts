import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit delay between requests (1 second per Nominatim usage policy)
const RATE_LIMIT_MS = 1000;

// Address normalization to improve geocoding success on messy inputs
const NOISE_PATTERNS = [
  /\bTENANT REQUEST FOR\b/gi,
  /\bTRASH IN DITCH\b/gi,
  /\bNUMEROUS\b/gi,
  /\bUNDERGROUND\b/gi,
  /\bTRIPPING\b/gi,
  /\bMULTIPLE\b/gi,
];

function normalizeAddress(raw: string): string {
  if (!raw) return "";
  let a = raw;
  // Remove parenthetical notes and trailing unit/building descriptors
  a = a.replace(/\(.*?\)/g, "");
  a = a.replace(/[, ]+\b(?:UN|UNIT|APT|APARTMENT|BLDG|BUILDING)\b.*$/i, "");
  // Remove noisy descriptors
  for (const p of NOISE_PATTERNS) a = a.replace(p, "");
  // Normalize intersections: "/" -> " & "
  a = a.replace(/\s*\/\s*/g, " & ");
  // Collapse whitespace
  a = a.replace(/\s{2,}/g, " ").trim();
  return a;
}


async function geocodeAddress(address: string, city: string, state: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  const normalized = normalizeAddress(address);
  const query = `${normalized}, ${city}, ${state} ${zip ?? ""}, USA`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1&countrycodes=us`;
  
  console.log(`Geocoding: ${query}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SnapIgnite-LeadApp/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Geocoding failed for "${query}": ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`Geocoding response for "${query}":`, JSON.stringify(data));
    
    if (data && data.length > 0) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
      console.log(`✓ Geocoded "${query}" to: ${coords.lat}, ${coords.lng}`);
      return coords;
    }
    
    console.warn(`✗ No results found for "${query}"`);
    return null;
  } catch (error) {
    console.error(`Error geocoding "${query}":`, error);
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

    console.log(`Starting to geocode ${properties.length} properties...`);

    // Process properties one at a time with rate limiting
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      console.log(`[${i + 1}/${properties.length}] Processing property ${property.id}: ${property.address}, ${property.city}, ${property.state}`);
      
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
          console.error(`✗ Error updating property ${property.id}:`, updateError);
          failCount++;
        } else {
          console.log(`✓ Successfully updated property ${property.id} with coordinates`);
          successCount++;
        }
      } else {
        console.warn(`✗ Failed to geocode property ${property.id}`);
        failCount++;
      }

      // Rate limit between requests (respect Nominatim's usage policy)
      if (i < properties.length - 1) {
        await delay(RATE_LIMIT_MS);
      }
    }

    console.log(`Geocoding complete: ${successCount} succeeded, ${failCount} failed`);

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
