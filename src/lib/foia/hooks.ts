import { useEffect, useState, useCallback, useRef } from 'react';
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
  const lastProfileIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (options?: { silent?: boolean; isSignOut?: boolean }) => {
    const silent = options?.silent ?? false;
    const isSignOut = options?.isSignOut ?? false;
    if (!silent) setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        // Only clear the cached profile on an explicit sign-out.  During
        // SIGNED_IN / TOKEN_REFRESHED cycles getSession() can transiently
        // return null while the token is being swapped – resetting profile
        // here would cause the queue page to re-fetch and show a loading
        // spinner every time the user returns from another tab.
        if (isSignOut && lastProfileIdRef.current !== null) {
          lastProfileIdRef.current = null;
          setProfile(null);
        }
        return;
      }

      // Skip re-fetch if we already have this user's profile
      if (silent && lastProfileIdRef.current === user.id) {
        return;
      }

      const { data, error } = await db
        .from('foia_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const newProfile = error || !data ? null : (data as FoiaProfile);
      lastProfileIdRef.current = newProfile?.id ?? null;
      setProfile(newProfile);
    } catch {
      lastProfileIdRef.current = null;
      setProfile(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Only re-fetch on actual auth changes, not token refreshes.
      // Pass isSignOut so the handler knows it's safe to clear the cached
      // profile (vs. a transient null during a SIGNED_IN token-refresh cycle).
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        fetchProfile({ silent: true, isSignOut: event === 'SIGNED_OUT' });
      }
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
