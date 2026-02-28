/**
 * Supabase client pointed at the production Pro instance (ojyxblegxpdgaqiscxpz).
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
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_EXTERNAL_SUPABASE_URL ||
  'https://ojyxblegxpdgaqiscxpz.supabase.co';

// Fallback string prevents createClient from throwing "supabaseKey is required"
// if env vars aren't injected at build time.
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeXhibGVneHBkZ2FxaXNjeHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTQ5NTMsImV4cCI6MjA3Mzg5MDk1M30.r9TsZsdtHiYVyyNXpeKB8iHumb3ZZfdDUHN4g8twGrU';

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
