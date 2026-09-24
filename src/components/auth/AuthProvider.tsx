import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/externalClient';
import { useToast } from '@/hooks/use-toast';
import { rotateRandomSeed } from '@/lib/randomSeed';
import { queryClient } from '@/lib/query';
import { clearSessionData } from '@/lib/clearSessionData';
import { createAuthBoundary, type AppRole } from '@/lib/authBoundary';
import { withTimeout } from '@/lib/withTimeout';

export type { AppRole } from '@/lib/authBoundary';

type AuthResult = { data: { user: User | null; session: Session | null } | null; error: Error | null };
const authFailure = (error: unknown) => error instanceof Error ? error : new Error('The authentication request failed. Please try again.');

interface AuthContextValue {
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  authError: string | null;
  refreshPermissions: () => void;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isVA: boolean;
  emailVerified: boolean;
  signUp: (email: string, password: string, fullName: string, inviteToken?: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  resendVerificationEmail: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchRoles(userId: string, signal: AbortSignal): Promise<AppRole[]> {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).abortSignal(signal);
  if (error) throw error;
  const roles = (data ?? []).map((row) => row.role).filter((role): role is AppRole => ['admin', 'va', 'user'].includes(role));
  // A successful lookup with no elevated role is an ordinary authenticated user.
  return roles.length ? roles : ['user'];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const userRef = useRef<User | null>(null);
  const boundaryRef = useRef<ReturnType<typeof createAuthBoundary<User>> | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let mounted = true;
    let sessionRevision = 0;
    const boundary = createAuthBoundary<User>({
      loadRoles: fetchRoles,
      clearSessionData: (preserveInitialActor) => {
        const storage: Storage[] = [];
        let recoverySessionStore: Storage | undefined;
        try { storage.push(window.localStorage); } catch { /* unavailable */ }
        try { recoverySessionStore = window.sessionStorage; storage.push(recoverySessionStore); } catch { /* unavailable */ }
        clearSessionData(queryClient, storage, preserveInitialActor, recoverySessionStore);
      },
      onChange: (state) => {
        if (!mounted) return;
        userRef.current = state.user;
        setUser(state.user);
        setRoles(state.roles);
        setLoading(state.loading);
        setAuthError(state.error);
      },
    });
    boundaryRef.current = boundary;

    const readSession = () => {
      const revision = ++sessionRevision;
      setLoading(true);
      setAuthError(null);
      withTimeout(supabase.auth.getSession(), 8000, 'Session lookup timed out')
        .then(({ data: { session }, error }) => {
          if (!mounted || revision !== sessionRevision) return;
          if (error) throw error;
          boundary.apply(session?.user ?? null);
        })
        .catch(() => {
          if (mounted && revision === sessionRevision) boundary.fail('We could not verify your session. Please try again.');
        });
    };
    refreshRef.current = () => userRef.current ? boundary.apply(userRef.current) : readSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionRevision += 1;
      boundary.apply(session?.user ?? null);
    });
    readSession();
    return () => {
      mounted = false;
      boundary.dispose();
      subscription.unsubscribe();
      boundaryRef.current = null;
      refreshRef.current = () => {};
    };
  }, []);
  const refreshPermissions = () => refreshRef.current();
  const signUp = async (email: string, password: string, fullName: string, inviteToken?: string) => {
    try {
      if (inviteToken) throw new Error('Team invitations require administrator confirmation. Please contact support.');
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
        toast({
          title: 'Account created successfully!',
          description: data.session ? 'Welcome to Snap Ignite.' : 'Check your email to verify your account before signing in.',
        });
      }

      return { data, error: null };
    } catch (cause: unknown) {
      const error = authFailure(cause);
      toast({
        title: 'Sign up failed',
        description: error.message,
        variant: 'destructive',
      });
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    boundaryRef.current?.apply(null);
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
    } catch (cause: unknown) {
      const error = authFailure(cause);
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
      return { data: null, error };
    }
  };

  const signOut = async () => {
    boundaryRef.current?.apply(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast({
        title: 'Signed out successfully',
        description: 'See you next time!',
      });
    } catch (cause: unknown) {
      const error = authFailure(cause);
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
    } catch (cause: unknown) {
      const error = authFailure(cause);
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
    } catch (cause: unknown) {
      const error = authFailure(cause);
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

  const value: AuthContextValue = {
      user,
      roles,
      loading,
      authError,
      refreshPermissions,
      hasRole,
      isAdmin,
      isVA,
      emailVerified,
      signUp,
      signIn,
      signOut,
      resetPassword,
      resendVerificationEmail,
    };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
