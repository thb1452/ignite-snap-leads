import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/externalClient';
import { useToast } from '@/hooks/use-toast';
import { rotateRandomSeed } from '@/lib/randomSeed';

export type AppRole = 'admin' | 'va' | 'user';

interface AuthContextValue {
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isVA: boolean;
  emailVerified: boolean;
  signUp: (email: string, password: string, fullName: string, inviteToken?: string) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  resendVerificationEmail: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ROLES_CACHE_KEY = 'snap_user_roles_cache';

function getCachedRoles(userId: string): AppRole[] | null {
  try {
    const cached = localStorage.getItem(ROLES_CACHE_KEY);
    if (cached) {
      const { userId: cachedUserId, roles, timestamp } = JSON.parse(cached);
      const isValid = cachedUserId === userId && Date.now() - timestamp < 5 * 60 * 1000;
      if (isValid && roles?.length > 0) {
        console.log('[useAuth] Using cached roles:', roles);
        return roles as AppRole[];
      }
    }
  } catch (e) {
    console.warn('[useAuth] Error reading cached roles:', e);
  }
  return null;
}

function cacheRoles(userId: string, roles: AppRole[]) {
  try {
    localStorage.setItem(
      ROLES_CACHE_KEY,
      JSON.stringify({
        userId,
        roles,
        timestamp: Date.now(),
      })
    );
    console.log('[useAuth] Cached roles:', roles);
  } catch (e) {
    console.warn('[useAuth] Error caching roles:', e);
  }
}

function clearCachedRoles() {
  try {
    localStorage.removeItem(ROLES_CACHE_KEY);
  } catch (e) {
    console.warn('[useAuth] Error clearing cached roles:', e);
  }
}

async function fetchRolesWithRetry(userId: string, maxRetries = 3): Promise<AppRole[]> {
  const cachedRoles = getCachedRoles(userId);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[useAuth] Fetching roles attempt ${attempt + 1}...`);
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (error) throw error;

      const fetchedRoles = roleData?.map((r) => r.role as AppRole) || [];
      const finalRoles = fetchedRoles.length > 0 ? fetchedRoles : (['user'] as AppRole[]);

      cacheRoles(userId, finalRoles);
      console.log('[useAuth] Fetched roles for', userId, ':', finalRoles);
      return finalRoles;
    } catch (err: any) {
      lastError = err;
      console.warn(`[useAuth] Role fetch attempt ${attempt + 1} failed:`, err.message);

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt)));
      }
    }
  }

  if (cachedRoles) {
    console.log('[useAuth] Using cached roles after fetch failure:', cachedRoles);
    return cachedRoles;
  }

  console.error('[useAuth] All role fetch attempts failed, no cache available:', lastError);
  return ['user'];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    let mounted = true;

    const applySignedOutState = () => {
      if (!mounted) return;
      setUser(null);
      userRef.current = null;
      setRoles([]);
      clearCachedRoles();
      setLoading(false);
    };

    const refreshRoles = async (userId: string) => {
      const freshRoles = await fetchRolesWithRetry(userId);
      if (!mounted || userRef.current?.id !== userId) return;
      setRoles(freshRoles);
      setLoading(false);
    };

    const applySignedInState = (currentUser: User, options?: { eager?: boolean }) => {
      const eager = options?.eager ?? false;
      if (!mounted) return;

      setUser(currentUser);
      userRef.current = currentUser;

      const cachedRoles = getCachedRoles(currentUser.id);
      if (cachedRoles && cachedRoles.length > 0) {
        setRoles(cachedRoles);
        setLoading(false);
      } else {
        const optimisticRoles: AppRole[] = ['user'];
        setRoles(optimisticRoles);
        cacheRoles(currentUser.id, optimisticRoles);
        setLoading(eager);
      }

      const runRefresh = () => {
        refreshRoles(currentUser.id);
      };

      if (eager) {
        runRefresh();
      } else {
        setTimeout(runRefresh, 0);
      }
    };

    console.log('[useAuth] Initializing auth...');

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      console.log('[useAuth] Auth state changed:', _event, currentUser?.id || 'none');

      if (!currentUser) {
        applySignedOutState();
        return;
      }

      applySignedInState(currentUser);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        const currentUser = session?.user ?? null;
        console.log('[useAuth] User session:', currentUser?.id || 'none');

        if (!currentUser) {
          applySignedOutState();
          return;
        }

        applySignedInState(currentUser, { eager: true });
      })
      .catch((err) => {
        console.error('[useAuth] Init error:', err);
        applySignedOutState();
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [toast]);

  const signUp = async (email: string, password: string, fullName: string, inviteToken?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        if (inviteToken) {
          const { data: invitation, error: inviteError } = await supabase
            .from('user_invitations')
            .update({
              status: 'accepted',
              accepted_at: new Date().toISOString(),
            })
            .eq('token', inviteToken)
            .eq('email', email)
            .eq('status', 'pending')
            .select()
            .single();

          if (invitation && !inviteError) {
            const { error: roleError } = await supabase.from('user_roles').insert({
              user_id: data.user.id,
              role: invitation.role,
            });

            if (roleError) {
              console.error('Role assignment error:', roleError);
            } else {
              console.log('Role assigned from invitation:', invitation.role);
            }
          } else {
            console.error('Failed to process invitation:', inviteError);
          }
        }

        if (!data.session) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (signInError) {
            throw signInError;
          }

          toast({
            title: 'Account created successfully!',
            description: inviteToken ? 'Welcome to the team!' : 'Welcome to Snap Ignite Demo',
          });

          return { data: signInData, error: null };
        }

        toast({
          title: 'Account created successfully!',
          description: inviteToken ? 'Welcome to the team!' : 'Welcome to Snap Ignite Demo',
        });
      }

      return { data, error: null };
    } catch (error: any) {
      toast({
        title: 'Sign up failed',
        description: error.message,
        variant: 'destructive',
      });
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      rotateRandomSeed();

      toast({
        title: 'Welcome back!',
        description: 'Successfully signed in',
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast({
        title: 'Signed out successfully',
        description: 'See you next time!',
      });
    } catch (error: any) {
      toast({
        title: 'Sign out failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      toast({
        title: 'Password reset email sent',
        description: 'Check your email for a password reset link',
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: 'Password reset failed',
        description: error.message,
        variant: 'destructive',
      });
      return { error };
    }
  };

  const resendVerificationEmail = async () => {
    if (!user?.email) return { error: new Error('No email address') };

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast({
        title: 'Verification email sent',
        description: 'Check your inbox for the verification link',
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: 'Failed to send verification email',
        description: error.message,
        variant: 'destructive',
      });
      return { error };
    }
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole('admin');
  const isVA = hasRole('va');
  const emailVerified = user?.email_confirmed_at != null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      roles,
      loading,
      hasRole,
      isAdmin,
      isVA,
      emailVerified,
      signUp,
      signIn,
      signOut,
      resetPassword,
      resendVerificationEmail,
    }),
    [user, roles, loading, emailVerified]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
