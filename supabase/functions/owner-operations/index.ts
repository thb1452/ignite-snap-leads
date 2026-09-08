import { createHandler } from './handler.ts';
import { publishingSources } from './publishing.ts';
function keySet(name: string): Record<string,string> {
  try { return JSON.parse(Deno.env.get(name) || '{}'); } catch { return {}; }
}
Deno.serve(createHandler({
  url: Deno.env.get('SUPABASE_URL') || '',
  publicKey: keySet('SUPABASE_PUBLISHABLE_KEYS').default || Deno.env.get('SUPABASE_ANON_KEY') || '',
  secretKey: keySet('SUPABASE_SECRET_KEYS').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
}, publishingSources));
