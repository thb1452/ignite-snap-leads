import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { handleExport, headers } from './handler.ts';
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) return new Response(JSON.stringify({ code: 'EXPORT_UNAVAILABLE', error: 'Export temporarily unavailable.' }), {
    status: 503, headers: { ...headers, 'Content-Type': 'application/json' },
  });
  const client = createClient(url, key, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return handleExport(req, client);
});
