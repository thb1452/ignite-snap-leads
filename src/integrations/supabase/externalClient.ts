/**
 * Supabase client pointed at the production Pro instance (dqwolscmceelqpkfclgi).
 *
 * Preferred env vars:  VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
 * Legacy fallbacks:    VITE_EXTERNAL_SUPABASE_URL + VITE_EXTERNAL_SUPABASE_ANON_KEY
 *
 * Both sets are checked so the app never throws on startup if only one
 * pair is present in the current deployment.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL =
  import.meta.env.VITE_EXTERNAL_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  'https://dqwolscmceelqpkfclgi.supabase.co';

// Fallback string prevents createClient from throwing "supabaseKey is required"
// if env vars aren't injected at build time. API calls will return 401 until the
// correct key is set in Lovable → Settings → Secrets.
const SUPABASE_KEY =
  import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'not-configured';

// Export the resolved URL for edge function calls
export const supabaseUrl = SUPABASE_URL;

// Safe localStorage access (guards against mobile/SSR environments)
const safeStorage = (() => {
  try {
    return typeof window !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
})();

// Create the Supabase client
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      storage: safeStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
