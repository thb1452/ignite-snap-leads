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
    // SECURITY: Require valid JWT and admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Verify user identity
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = authData.user.id;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { cityOrState } = await req.json();

    if (!cityOrState) {
      throw new Error('City or state is required');
    }

    const normalized = cityOrState.trim().toUpperCase();
    console.log(`[bulk-delete] Admin ${userId} deleting properties in: ${normalized}`);

    // Get all property IDs that match
    const { data: properties, error: fetchError } = await adminClient
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
    const tables = [
      { table: 'violations', col: 'property_id' },
      { table: 'property_contacts', col: 'property_id' },
      { table: 'list_properties', col: 'property_id' },
      { table: 'lead_activity', col: 'property_id' },
      { table: 'upload_staging', col: 'property_id' },
    ];

    for (const { table, col } of tables) {
      const { error } = await adminClient.from(table).delete().in(col, propertyIds);
      if (error) console.error(`[bulk-delete] ${table} delete error:`, error);
    }

    // Finally, delete properties
    const { error: propertiesError } = await adminClient
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});