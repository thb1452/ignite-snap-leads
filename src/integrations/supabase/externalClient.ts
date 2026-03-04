/**
 * Legacy compatibility shim.
 *
 * Previously this file created a second Supabase client, which caused
 * "Multiple GoTrueClient instances" warnings and auth-session conflicts.
 *
 * Now it re-exports the single canonical client so every import
 * (FOIA module, main app, etc.) shares one auth session.
 */

export { supabase } from './client';

// Re-export the resolved URL for edge-function callers
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ojyxblegxpdgaqiscxpz.supabase.co';

export const supabaseUrl = SUPABASE_URL;
