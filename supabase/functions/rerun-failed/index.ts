import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  try {
    const { job_id } = await req.json();
    if (!job_id) return json(400, { ok: false, error: 'job_id required' });

    // Fetch source job (RLS ensures ownership)
    const { data: src, error: e1 } = await supabase
      .from('skiptrace_jobs').select('*').eq('id', job_id).single();
    if (e1 || !src) return json(404, { ok: false, error: 'Job not found' });

    // Get failed & no_match property_ids from outcomes
    const { data: failedRows, error: e2 } = await supabase
      .from('skiptrace_outcomes')
      .select('property_id, status')
      .eq('job_id', job_id)
      .in('status', ['no_match', 'vendor_error', 'timeout']);

    if (e2) return json(500, { ok: false, error: 'Failed to load outcomes' });

    let propertyIds: string[] = (failedRows ?? []).map(x => x.property_id);

    // Fallback: infer from contacts if no outcomes
    if (propertyIds.length === 0) {
      const { data: properties } = await supabase
        .from('properties')
        .select('id')
        .in('id', src.property_ids);

      const propIds = properties?.map(p => p.id) ?? [];
      
      const { data: contacts } = await supabase
        .from('property_contacts')
        .select('property_id')
        .in('property_id', propIds);

      const contactedIds = new Set((contacts ?? []).map(c => c.property_id));
      propertyIds = propIds.filter(id => !contactedIds.has(id));
    }

    if (propertyIds.length === 0) {
      return json(200, { ok: true, message: 'Nothing to rerun', total: 0 });
    }

    // Create idempotent key
    const sorted = [...new Set(propertyIds)].sort();
    const jobKey = `${src.user_id}:rerun:${src.id}:${sorted.join(',')}`;

    // Try insert new job
    const ins = await supabase.from('skiptrace_jobs').insert({
      user_id: src.user_id,
      property_ids: sorted,
      job_key: jobKey,
      status: 'queued',
      counts: { total: sorted.length, succeeded: 0, failed: 0 },
    }).select().single();

    // Handle duplicate
    if (ins.error?.code === '23505') {
      const { data: existing } = await supabase
        .from('skiptrace_jobs').select('*').eq('job_key', jobKey)
        .order('created_at', { ascending: false }).limit(1).single();
      return json(200, { ok: true, job_id: existing!.id, total: sorted.length, idempotent: true });
    }
    if (ins.error) return json(500, { ok: false, error: 'Failed to create rerun job' });

    // Charge credits
    const { error: chargeError } = await supabase.rpc('fn_charge_credits', {
      p_property_ids: sorted,
      p_job_id: ins.data.id
    });

    if (chargeError?.message?.includes('insufficient credits')) {
      await supabase.from('skiptrace_jobs').delete().eq('id', ins.data.id);
      return json(402, { ok: false, error: 'Insufficient credits' });
    }
    if (chargeError) {
      await supabase.from('skiptrace_jobs').delete().eq('id', ins.data.id);
      return json(500, { ok: false, error: 'Failed to charge credits' });
    }

    // Invoke bulk processor
    await supabase.functions.invoke('skiptrace-bulk', {
      body: { 
        property_ids: sorted,
        job_id: ins.data.id
      },
    });

    return json(200, { ok: true, job_id: ins.data.id, total: sorted.length });
  } catch (e: any) {
    console.error('Rerun failed error:', e);
    return json(500, { ok: false, error: e.message ?? 'Internal error' });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { 
    status, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  });
}
