// Single typed alias for Supabase that bypasses generated Database types
// for FOIA tables not yet in the auto-generated types.ts.
//
// Remove this file after running: supabase gen types typescript
// and updating src/integrations/supabase/types.ts.
import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;
