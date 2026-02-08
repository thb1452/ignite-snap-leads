/**
 * External Supabase Client
 * 
 * This client connects to the external Supabase Pro instance (dqwolscmceelqpkfclgi)
 * after migrating from Lovable Cloud.
 * 
 * Usage: Import this instead of the auto-generated client when ready to switch:
 * import { supabase } from "@/integrations/supabase/externalClient";
 * 
 * Required environment variables:
 * - VITE_EXTERNAL_SUPABASE_URL
 * - VITE_EXTERNAL_SUPABASE_ANON_KEY
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// External Supabase Pro instance credentials
const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

// Validate that external credentials are configured
if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_ANON_KEY) {
  console.warn(
    '[External Supabase] Missing environment variables. ' +
    'Set VITE_EXTERNAL_SUPABASE_URL and VITE_EXTERNAL_SUPABASE_ANON_KEY to enable external client.'
  );
}

// Create the external Supabase client
export const supabaseExternal = createClient<Database>(
  EXTERNAL_SUPABASE_URL || '',
  EXTERNAL_SUPABASE_ANON_KEY || '',
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
