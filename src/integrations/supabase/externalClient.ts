/**
 * External Supabase Client
 * 
 * This client connects to the external Supabase Pro instance (dqwolscmceelqpkfclgi)
 * after migrating from Lovable Cloud.
 * 
 * Falls back to Lovable Cloud Supabase if external credentials aren't configured.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// External Supabase Pro instance credentials (primary)
const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

// Lovable Cloud Supabase credentials (fallback)
const LOVABLE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const LOVABLE_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Determine which credentials to use
const useExternal = EXTERNAL_SUPABASE_URL && EXTERNAL_SUPABASE_ANON_KEY;
const SUPABASE_URL = useExternal ? EXTERNAL_SUPABASE_URL : LOVABLE_SUPABASE_URL;
const SUPABASE_KEY = useExternal ? EXTERNAL_SUPABASE_ANON_KEY : LOVABLE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing Supabase credentials. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set.'
  );
}

if (useExternal) {
  console.log('[Supabase] Using external Supabase Pro instance');
} else {
  console.log('[Supabase] Using Lovable Cloud Supabase');
}

// Create the Supabase client
export const supabaseExternal = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Re-export as 'supabase' for easy drop-in replacement
export const supabase = supabaseExternal;
