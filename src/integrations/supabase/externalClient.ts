/**
 * Supabase client pointed at the production Pro instance.
 * Configure via VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dqwolscmceelqpkfclgi.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
