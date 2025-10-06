import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SkipTraceRequest {
  property_id: string;
  phone_hint?: string | null;
}

interface BatchDataResponse {
  owner_name?: string;
  phones?: string[];
  emails?: string[];
  vacant?: boolean;
  [key: string]: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const batchDataKey = Deno.env.get('BATCHDATA_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { property_id, phone_hint }: SkipTraceRequest = await req.json();

    console.log('Skip trace request for property:', property_id);

    // Fetch property details
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', property_id)
      .single();

    if (propError || !property) {
      throw new Error('Property not found');
    }

    // Construct full address
    const fullAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
    console.log('Skip tracing address:', fullAddress);

    // Call BatchData API
    const batchDataResponse = await fetch('https://api.batchdata.com/skip-trace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${batchDataKey}`,
      },
      body: JSON.stringify({
        address: fullAddress,
        ...(phone_hint && { phone_hint }),
      }),
    });

    if (!batchDataResponse.ok) {
      const errorText = await batchDataResponse.text();
      console.error('BatchData API error:', errorText);
      throw new Error(`BatchData API failed: ${batchDataResponse.status}`);
    }

    const batchData: BatchDataResponse = await batchDataResponse.json();
    console.log('BatchData response:', batchData);

    // Consume one credit
    const { error: creditError } = await supabase.rpc('fn_consume_credit', {
      p_reason: 'skip_trace',
      p_meta: { property_id, address: fullAddress },
    });

    if (creditError) {
      console.error('Credit consumption error:', creditError);
      throw new Error('Insufficient credits or credit error');
    }

    // Store contacts in database
    const contacts = [];
    const ownerName = batchData.owner_name || 'Unknown Owner';

    // Create contact records for phones
    if (batchData.phones && batchData.phones.length > 0) {
      for (const phone of batchData.phones) {
        const { data: contact, error: contactError } = await supabase
          .from('property_contacts')
          .insert({
            property_id,
            name: ownerName,
            phone,
            email: batchData.emails?.[0] || null,
            source: 'batchdata',
            raw_payload: batchData,
            created_by: user.id,
          })
          .select()
          .single();

        if (!contactError && contact) {
          contacts.push(contact);
        }
      }
    }

    // If no phones but has emails, create contact with email only
    if ((!batchData.phones || batchData.phones.length === 0) && batchData.emails && batchData.emails.length > 0) {
      const { data: contact, error: contactError } = await supabase
        .from('property_contacts')
        .insert({
          property_id,
          name: ownerName,
          phone: null,
          email: batchData.emails[0],
          source: 'batchdata',
          raw_payload: batchData,
          created_by: user.id,
        })
        .select()
        .single();

      if (!contactError && contact) {
        contacts.push(contact);
      }
    }

    console.log(`Created ${contacts.length} contact records`);

    return new Response(
      JSON.stringify({
        ok: true,
        contacts,
        raw_data: batchData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Skip trace error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: error.message.includes('Unauthorized') ? 401 : 
                error.message.includes('INSUFFICIENT_CREDITS') ? 402 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
