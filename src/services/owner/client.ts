import { createClient } from '@supabase/supabase-js';

// Separate worker session: the retired customer Auth project is not required here.
export const OWNER_API_URL = 'https://dqwolscmceelqpkfclgi.supabase.co';
export const OWNER_PUBLIC_KEY = 'sb_publishable_-3QJxkpjLesV7EyxiJLbwA_GZ91hngH';
export const ownerClient = createClient(OWNER_API_URL, OWNER_PUBLIC_KEY, {
  auth: { storageKey: 'snap-owner-auth', persistSession: true, autoRefreshToken: true },
});
