import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { createOriginalIntakeEndpoint } from '../_shared/originalIntakeEndpoint.ts';
import { createOriginalTransport } from '../_shared/supabaseOriginalTransport.ts';
import { IntakeError } from '../_shared/originalIntake.ts';

// New write path remains disabled by both the default endpoint gate and SQL.
// No request field, user metadata, service bearer or environment flag enables it.
Deno.serve(createOriginalIntakeEndpoint(async (request, signal) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  if (url !== 'https://ojyxblegxpdgaqiscxpz.supabase.co' || !anon || !/^Bearer [^\s]+$/.test(authorization) || authorization.slice(7) === anon) throw new IntakeError('owner_changed');
  const fetchBound = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal });
  const owner = createClient(url, anon, { global: { headers: { Authorization: authorization }, fetch: fetchBound }, auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await owner.auth.getUser(authorization.slice(7));
  if (auth.error || !auth.data?.user || auth.data.user.is_anonymous || !auth.data.user.email_confirmed_at && !auth.data.user.phone_confirmed_at) throw new IntakeError('owner_changed');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!key) throw new IntakeError('unconfirmed');
  const service = createClient(url, key, { global: { fetch: fetchBound }, auth: { persistSession: false, autoRefreshToken: false } });
  return createOriginalTransport(owner, service);
}));
