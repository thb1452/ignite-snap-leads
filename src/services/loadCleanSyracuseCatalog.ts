import { supabase } from '@/integrations/supabase/client';
import { parseCleanSyracuseCatalog, type CleanSyracuseProperty } from './cleanSyracuseCatalog';

export async function loadCleanSyracuseCatalog(actor: string, search: string): Promise<CleanSyracuseProperty[]> {
  if (search.length > 80) throw new Error('Search is too long.');
  const before = await supabase.auth.getUser();
  if (before.error || before.data.user?.id !== actor) throw new Error('Sign in to see accepted properties.');
  const { data, error } = await supabase.rpc('fn_clean_syracuse_catalog_v1' as never, {
    p_search: search.trim() || null,
  } as never);
  if (error) throw new Error('Accepted Syracuse properties are unavailable for this account.');
  const after = await supabase.auth.getUser();
  if (after.error || after.data.user?.id !== actor) throw new Error('Your account changed. Refresh before continuing.');
  return parseCleanSyracuseCatalog(data);
}
