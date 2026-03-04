// Typed Supabase client alias for FOIA helpers.
// FOIA tables are fully represented in src/integrations/supabase/types.ts.
import { supabase } from '@/integrations/supabase/externalClient';

export const db = supabase;
