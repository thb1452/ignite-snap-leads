import { supabase } from '@/integrations/supabase/client';
import type { FoiaProfile, FoiaRole } from '@/types/foia';

let cachedProfile: FoiaProfile | null = null;

export async function getFoiaProfile(): Promise<FoiaProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('foia_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  cachedProfile = data as FoiaProfile;
  return cachedProfile;
}

export async function isFoiaAdmin(): Promise<boolean> {
  const profile = await getFoiaProfile();
  return profile?.role === 'admin';
}

export async function isFoiaVA(): Promise<boolean> {
  const profile = await getFoiaProfile();
  return profile?.role === 'va';
}

export async function getFoiaRole(): Promise<FoiaRole | null> {
  const profile = await getFoiaProfile();
  return profile?.role ?? null;
}

export async function ensureFoiaProfile(
  userId: string,
  email: string,
  fullName: string,
  role: FoiaRole = 'va'
): Promise<FoiaProfile> {
  const { data, error } = await supabase
    .from('foia_profiles')
    .upsert(
      { id: userId, email, full_name: fullName, role },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as FoiaProfile;
}

export function clearProfileCache() {
  cachedProfile = null;
}
