import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/externalClient';
import { db } from '@/lib/foia/db';
import type { FoiaProfile, FoiaRole } from '@/types/foia';

interface UseFoiaAuthReturn {
  profile: FoiaProfile | null;
  loading: boolean;
  role: FoiaRole | null;
  isAdmin: boolean;
  isVA: boolean;
  refetch: () => void;
}

export function useFoiaAuth(): UseFoiaAuthReturn {
  const [profile, setProfile] = useState<FoiaProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setProfile(null);
        return;
      }

      const { data, error } = await db
        .from('foia_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      setProfile(error || !data ? null : (data as FoiaProfile));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchProfile();
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    role: profile?.role ?? null,
    isAdmin: profile?.role === 'admin',
    isVA: profile?.role === 'va',
    refetch: fetchProfile,
  };
}
