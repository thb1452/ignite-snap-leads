import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/externalClient';
import { db } from '@/lib/foia/db';

// Use `db` (untyped alias) for RPC calls not in generated types
const rpc = db.rpc.bind(db);


export default function FoiaLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'update-password'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const withTimeout = async <T,>(
    promise: PromiseLike<T>,
    message: string,
    ms = 12000
  ): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    );

    return (await Promise.race([Promise.resolve(promise), timeoutPromise])) as T;
  };

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return fallback;
  };

  const ensureAuthenticatedSession = async (
    seedSession?: { access_token: string; refresh_token: string } | null
  ): Promise<boolean> => {
    try {
      if (seedSession?.access_token && seedSession?.refresh_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: seedSession.access_token,
          refresh_token: seedSession.refresh_token,
        });
        if (!setSessionError) return true;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) return true;

      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      return !refreshError && !!refreshed.session?.access_token;
    } catch {
      return false;
    }
  };

  // Detect when Supabase redirects back after the user clicks the reset link.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update-password');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) return;
    setMode('signup');

    const checkInvite = async () => {
      // Use SECURITY DEFINER RPC — unauthenticated users can't query
      // foia_invites directly due to RLS.
      const { data, error } = await rpc('check_foia_invite', { p_token: token });
      const invites = (data ?? []) as Array<{ email: string; accepted: boolean; expires_at: string }>;
      if (error || invites.length === 0) { setInviteValid(false); return; }
      const invite = invites[0];
      const expired = new Date(invite.expires_at) < new Date();
      if (invite.accepted || expired) { setInviteValid(false); return; }
      setEmail(invite.email);
      setInviteValid(true);
    };
    checkInvite();
  }, [token]);

  // Helper: determine the correct FOIA role for a user.
  // If they have 'admin' in user_roles (main app), they should be FOIA admin too.
  const resolveFoiaRole = async (userId: string): Promise<'admin' | 'va'> => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      return data ? 'admin' : 'va';
    } catch {
      return 'va';
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const signInResult: any = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        'Sign in timed out. Please check your connection and try again.'
      );
      const { data, error } = signInResult;
      if (error) throw error;

      const user = data.user;
      if (!user) throw new Error('Login failed — no user returned');

      const hasSession = await ensureAuthenticatedSession(data.session ?? null);

      const profileResult: any = await withTimeout(
        db
          .from('foia_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle(),
        'Profile lookup timed out. Please try signing in again.'
      );
      const { data: profile, error: profileErr } = profileResult;

      // Surface profile-lookup errors, but auto-recover when PostgREST schema
      // cache is stale by provisioning the FOIA profile via RPC.
      if (profileErr) {
        const isSchemaError =
          (profileErr as any)?.code === 'PGRST200' ||
          String((profileErr as any)?.message ?? '').includes('schema cache');

        if (isSchemaError) {
          if (!hasSession) {
            throw new Error('Signed in, but your secure session is still initializing. Please tap Sign In again.');
          }

          const derivedName = user.user_metadata?.full_name
            ?? user.email?.split('@')[0]
            ?? 'User';
          const derivedRole = await resolveFoiaRole(user.id);

          const signupResult: any = await withTimeout(
            rpc('complete_foia_signup', {
              p_user_id: user.id,
              p_email: user.email ?? email,
              p_full_name: derivedName,
              p_role: derivedRole,
              p_token: null,
            }),
            'Account provisioning timed out. Please try again.'
          );
          const { error: createErr } = signupResult;
          if (createErr) {
            const createErrMsg = getErrorMessage(createErr, 'Profile provisioning failed');
            if (createErrMsg.includes('Unauthorized profile provisioning attempt')) {
              throw new Error('Signed in, but your session was not fully established. Please tap Sign In once more.');
            }
            throw new Error('FOIA access is not available for this account. Please contact your administrator.');
          }

          navigate(derivedRole === 'admin' ? '/foia/admin' : '/foia/va');
          return;
        }

        throw profileErr;
      }

      if (!profile) {
        if (!hasSession) {
          throw new Error('Signed in, but your secure session is still initializing. Please tap Sign In again.');
        }

        // Auth succeeded but no foia_profile row exists — the user signed up
        // before but the profile creation step failed (e.g. RLS was blocking it).
        // Auto-create the profile now that we have a valid authenticated session.
        // Preserve their main-app admin role if they have one.
        const derivedName = user.user_metadata?.full_name
          ?? user.email?.split('@')[0]
          ?? 'User';
        const derivedRole = await resolveFoiaRole(user.id);
        const signupResult: any = await withTimeout(
          rpc('complete_foia_signup', {
            p_user_id: user.id,
            p_email: user.email ?? email,
            p_full_name: derivedName,
            p_role: derivedRole,
            p_token: null,
          }),
          'Account provisioning timed out. Please try again.'
        );
        const { error: createErr } = signupResult;
        if (createErr) {
          const createErrMsg = getErrorMessage(createErr, 'Profile provisioning failed');
          if (createErrMsg.includes('Unauthorized profile provisioning attempt')) {
            throw new Error('Signed in, but your session was not fully established. Please tap Sign In once more.');
          }
          throw new Error('No FOIA platform access. Contact your administrator.');
        }
        navigate(derivedRole === 'admin' ? '/foia/admin' : '/foia/va');
        return;
      }

      navigate(profile.role === 'admin' ? '/foia/admin' : '/foia/va');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (!fullName.trim()) throw new Error('Full name is required');
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      const user = data.user;
      if (!user) throw new Error('Signup failed — no user returned');

      // When email confirmation is enabled and the email is already registered,
      // Supabase returns the user with identities:[] instead of an error.
      // In that case sign them in directly so we can create their missing profile.
      const alreadyRegistered = Array.isArray((user as any).identities) &&
        (user as any).identities.length === 0;

      let finalUserId = user.id;
      let hasSession = !!data.session;

      if (alreadyRegistered) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw new Error('This email is already registered. Please sign in with your existing password.');
        }
        finalUserId = signInData.user.id;
        hasSession = true;
      }

      // Create profile via SECURITY DEFINER RPC — bypasses RLS and works
      // even when there is no session yet (email confirmation enabled).
      const { error: profileError } = await rpc('complete_foia_signup', {
        p_user_id: finalUserId,
        p_email: email,
        p_full_name: fullName,
        p_role: 'va',
        p_token: token ?? null,
      });
      if (profileError) throw profileError;

      if (!hasSession) {
        setAwaitingConfirmation(true);
        return;
      }
      navigate('/foia/va');
    } catch (err: unknown) {
      // PostgrestError is a plain object (not an Error instance) — unwrap .message explicitly
      const msg =
        err instanceof Error ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Signup failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/foia/login`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMode('login');
        setError('Password updated. Please sign in with your new password.');
        return;
      }

      const profileResult: any = await withTimeout(
        db
          .from('foia_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle(),
        'Profile lookup timed out. Please sign in with your new password.'
      );
      const { data: profile, error: profileErr } = profileResult;

      // If the profile lookup itself failed (e.g. RLS timeout), fall back to
      // the login form — the password has already been updated successfully.
      if (profileErr) {
        setMode('login');
        setError('Password updated! Please sign in with your new password.');
        return;
      }

      if (!profile) {
        const derivedName = user.user_metadata?.full_name
          ?? user.email?.split('@')[0]
          ?? 'User';
        // Preserve their main-app admin role if they have one.
        const derivedRole = await resolveFoiaRole(user.id);

        const signupResult: any = await withTimeout(
          rpc('complete_foia_signup', {
            p_user_id: user.id,
            p_email: user.email ?? email,
            p_full_name: derivedName,
            p_role: derivedRole,
            p_token: null,
          }),
          'Account provisioning timed out. Please sign in with your new password.'
        );
        const { error: createErr } = signupResult;

        if (createErr) {
          // Password was updated successfully — send the user to sign in.
          // An admin will need to invite them to the FOIA platform.
          setMode('login');
          setError('Password updated! Sign in below. If you still can\'t access the platform, contact your administrator.');
          return;
        }

        navigate(derivedRole === 'admin' ? '/foia/admin' : '/foia/va');
        return;
      }

      navigate(profile.role === 'admin' ? '/foia/admin' : '/foia/va');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (awaitingConfirmation || resetSent) {
    const isReset = resetSent;
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
          <p className="text-slate-400 text-sm">
            {isReset
              ? <>A password reset link has been sent to <span className="text-white">{email}</span>. Click the link in that email to set a new password.</>
              : <>A confirmation link has been sent to <span className="text-white">{email}</span>. Click the link to activate your account.</>
            }
          </p>
          {isReset && (
            <button onClick={() => { setResetSent(false); setMode('login'); }} className="mt-4 text-blue-400 hover:text-blue-300 text-sm">
              Back to sign in
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">FOIA Ops Platform</h1>
          <p className="text-slate-400 text-sm mt-1">Snap Ignite Internal Tool</p>
        </div>

        {token && inviteValid === false && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-sm text-red-300 text-center">
            This invite link is invalid or has expired. Contact your admin.
          </div>
        )}

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          {mode === 'signup' && token && inviteValid && (
            <div className="bg-blue-900/40 border border-blue-700 rounded-lg p-3 mb-4 text-sm text-blue-300">
              You've been invited to join the FOIA platform. Create your account below.
            </div>
          )}

          {/* ── Set new password (after clicking reset link in email) ── */}
          {mode === 'update-password' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <p className="text-slate-300 text-sm mb-2">Enter your new password below.</p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" required minLength={8} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-900/30 rounded-lg p-2">{error}</p>}
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Set New Password
              </button>
            </form>
          )}

          {/* ── Forgot password form ── */}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-slate-300 text-sm">Enter your email and we'll send you a reset link.</p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-900/30 rounded-lg p-2">{error}</p>}
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Reset Link
              </button>
              <p className="text-center text-slate-500 text-xs">
                <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-blue-400 hover:text-blue-300">Back to sign in</button>
              </p>
            </form>
          )}

          {/* ── Login / Signup forms ── */}
          {(mode === 'login' || mode === 'signup') && (
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required disabled={mode === 'signup' && !!token && inviteValid === true} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-300">Password</label>
                  {mode === 'login' && (
                    <button type="button" onClick={() => { setMode('reset'); setError(''); }} className="text-xs text-blue-400 hover:text-blue-300">
                      Forgot password?
                    </button>
                  )}
                </div>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Create a password' : 'Your password'} required minLength={8} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-900/30 rounded-lg p-2">{error}</p>}
              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          )}

          {!token && (mode === 'login' || mode === 'signup') && (
            <p className="text-center text-slate-500 text-xs mt-4">
              {mode === 'login' ? (
                <>Need access?{' '}<button onClick={() => setMode('signup')} className="text-blue-400 hover:text-blue-300">Sign up</button></>
              ) : (
                <>Already have an account?{' '}<button onClick={() => setMode('login')} className="text-blue-400 hover:text-blue-300">Sign in</button></>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
