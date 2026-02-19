/**
 * External Supabase Client
 * 
 * Uses external Supabase Pro instance if configured,
 * otherwise falls back to Lovable Cloud Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// External Supabase Pro instance credentials (primary)
const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL;
const EXTERNAL_SUPABASE_ANON_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY;

// Lovable Cloud Supabase credentials (fallback)
const LOVABLE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ojyxblegxpdgaqiscxpz.supabase.co';
const LOVABLE_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeXhibGVneHBkZ2FxaXNjeHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTQ5NTMsImV4cCI6MjA3Mzg5MDk1M30.r9TsZsdtHiYVyyNXpeKB8iHumb3ZZfdDUHN4g8twGrU';

// Determine which credentials to use
const useExternal = !!EXTERNAL_SUPABASE_URL && !!EXTERNAL_SUPABASE_ANON_KEY;
const SUPABASE_URL = useExternal ? EXTERNAL_SUPABASE_URL : LOVABLE_SUPABASE_URL;
const SUPABASE_KEY = useExternal ? EXTERNAL_SUPABASE_ANON_KEY : LOVABLE_SUPABASE_KEY;

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
