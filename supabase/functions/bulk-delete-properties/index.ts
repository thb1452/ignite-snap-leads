import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { cityOrState } = await req.json();

    if (!cityOrState) {
      throw new Error('City or state is required');
    }

    const normalized = cityOrState.trim().toUpperCase();

    console.log(`[bulk-delete] Searching for properties in: ${normalized}`);

    // Get all property IDs that match
    const { data: properties, error: fetchError } = await supabaseClient
      .from('properties')
      .select('id')
      .or(`city.ilike.${normalized},state.ilike.${normalized}`);

    if (fetchError) throw new Error(`Failed to fetch properties: ${fetchError.message}`);

    if (!properties || properties.length === 0) {
      console.log(`[bulk-delete] No properties found for: ${normalized}`);
      return new Response(
        JSON.stringify({ deleted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    console.log(`[bulk-delete] Found ${propertyIds.length} properties to delete`);

    // Delete all related data in order
    
    // 1. Delete violations
    const { error: violationsError } = await supabaseClient
      .from('violations')
      .delete()
      .in('property_id', propertyIds);

    if (violationsError) {
      console.error('[bulk-delete] Violations delete error:', violationsError);
    }

    // 2. Delete property contacts
    const { error: contactsError } = await supabaseClient
      .from('property_contacts')
      .delete()
      .in('property_id', propertyIds);

    if (contactsError) {
      console.error('[bulk-delete] Contacts delete error:', contactsError);
    }

    // 3. Delete list_properties relationships
    const { error: listPropsError } = await supabaseClient
      .from('list_properties')
      .delete()
      .in('property_id', propertyIds);

    if (listPropsError) {
      console.error('[bulk-delete] List properties delete error:', listPropsError);
    }

    // 4. Delete lead_activity
    const { error: activityError } = await supabaseClient
      .from('lead_activity')
      .delete()
      .in('property_id', propertyIds);

    if (activityError) {
      console.error('[bulk-delete] Activity delete error:', activityError);
    }

    // 5. Delete upload_staging
    const { error: stagingError } = await supabaseClient
      .from('upload_staging')
      .delete()
      .in('property_id', propertyIds);

    if (stagingError) {
      console.error('[bulk-delete] Staging delete error:', stagingError);
    }

    // 6. Finally, delete properties
    const { error: propertiesError } = await supabaseClient
      .from('properties')
      .delete()
      .in('id', propertyIds);

    if (propertiesError) {
      throw new Error(`Failed to delete properties: ${propertiesError.message}`);
    }

    console.log(`[bulk-delete] Successfully deleted ${propertyIds.length} properties`);

    return new Response(
      JSON.stringify({ deleted: propertyIds.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bulk-delete] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
