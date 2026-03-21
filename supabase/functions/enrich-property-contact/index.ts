// Supabase Edge Function: Enrich property with owner contact info via BatchData
// Called automatically after a property is unlocked

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const batchdataKey = Deno.env.get("BATCHDATA_API_KEY");

    if (!batchdataKey) {
      return new Response(JSON.stringify({ error: "BATCHDATA_API_KEY not configured" }), { status: 500, headers });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const userId = authData.user.id;
    const { property_id } = await req.json();

    if (!property_id) {
      return new Response(JSON.stringify({ error: "property_id required" }), { status: 400, headers });
    }

    // Check if contacts already exist for this property
    const { data: existing } = await supabase
      .from("property_contacts")
      .select("id")
      .eq("property_id", property_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, cached: true, message: "Contacts already enriched" }), { headers });
    }

    // Get property address
    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select("address, city, state, zip")
      .eq("id", property_id)
      .single();

    if (propErr || !property) {
      return new Response(JSON.stringify({ error: "Property not found" }), { status: 404, headers });
    }

    // Call BatchData Property Skip Trace API
    const batchRes = await fetch("https://api.batchdata.com/api/v1/property/skip-trace", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${batchdataKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{
          streetAddress: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
        }],
      }),
    });

    if (!batchRes.ok) {
      const errText = await batchRes.text();
      console.error("[enrich-property-contact] BatchData error:", batchRes.status, errText);
      return new Response(JSON.stringify({ success: false, error: "Enrichment provider error" }), { status: 502, headers });
    }

    const batchData = await batchRes.json();
    const results = batchData?.results?.persons || batchData?.results?.[0]?.persons || [];

    if (!results || results.length === 0) {
      // Store a "no result" marker so we don't retry
      await supabase.from("property_contacts").insert({
        property_id,
        created_by: userId,
        source: "batchdata",
        name: null,
        phone: null,
        email: null,
        raw_payload: batchData,
      });

      return new Response(JSON.stringify({ success: true, contacts: 0, message: "No contacts found" }), { headers });
    }

    // Insert contacts (up to 3 persons)
    const contacts = results.slice(0, 3).map((person: any) => {
      const phone = person.phones?.[0]?.phone || person.phoneNumbers?.[0]?.number || null;
      const email = person.emails?.[0]?.email || person.emailAddresses?.[0]?.address || null;
      const name = [person.firstName, person.lastName].filter(Boolean).join(" ") || person.name || null;

      return {
        property_id,
        created_by: userId,
        source: "batchdata",
        name,
        phone,
        email,
        raw_payload: person,
      };
    });

    const { error: insertErr } = await supabase.from("property_contacts").insert(contacts);
    if (insertErr) {
      console.error("[enrich-property-contact] Insert error:", insertErr);
      return new Response(JSON.stringify({ success: false, error: "Failed to save contacts" }), { status: 500, headers });
    }

    return new Response(
      JSON.stringify({ success: true, contacts: contacts.length }),
      { headers }
    );
  } catch (e: any) {
    console.error("[enrich-property-contact] error:", e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), { status: 500, headers });
  }
});
