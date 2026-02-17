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
import { supabase as lovableClient } from './client';

// External Supabase Pro instance credentials (primary)
const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

const useExternal = EXTERNAL_SUPABASE_URL && EXTERNAL_SUPABASE_ANON_KEY;

// If external credentials exist, create a dedicated client; otherwise reuse Lovable Cloud client
export const supabase = useExternal
  ? createClient<Database>(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
    })
  : lovableClient;
