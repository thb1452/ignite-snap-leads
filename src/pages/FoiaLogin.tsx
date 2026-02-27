import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/foia/db';


export default function FoiaLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  useEffect(() => {
    if (!token) return;
    setMode('signup');

    const checkInvite = async () => {
      // Use SECURITY DEFINER RPC — unauthenticated users can't query
      // foia_invites directly due to RLS.
      const { data, error } = await supabase.rpc('check_foia_invite', { p_token: token });
      if (error || !data || data.length === 0) { setInviteValid(false); return; }
      const invite = data[0] as { email: string; accepted: boolean; expires_at: string };
      const expired = new Date(invite.expires_at) < new Date();
      if (invite.accepted || expired) { setInviteValid(false); return; }
      setEmail(invite.email);
      setInviteValid(true);
    };
    checkInvite();
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = data.user;
      const { data: profile } = await db
        .from('foia_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile) throw new Error('No FOIA platform access. Contact your administrator.');
      navigate(profile.role === 'admin' ? '/foia/admin' : '/foia/va');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
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

      // Create profile via SECURITY DEFINER RPC so it works regardless of
      // whether Supabase email confirmation is enabled (no session yet)
      // and regardless of the foia_profiles INSERT RLS policy.
      const { error: profileError } = await supabase.rpc('complete_foia_signup', {
        p_user_id: user.id,
        p_email: email,
        p_full_name: fullName,
        p_role: 'va',
        p_token: token ?? null,
      });
      if (profileError) throw profileError;

      // If email confirmation is enabled, data.session is null.
      if (!data.session) {
        setAwaitingConfirmation(true);
        return;
      }
      navigate('/foia/va');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
          <p className="text-slate-400 text-sm">
            A confirmation link has been sent to <span className="text-white">{email}</span>.
            Click the link to activate your account.
          </p>
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
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Create a password' : 'Your password'} required minLength={8} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && <p className="text-red-400 text-sm bg-red-900/30 rounded-lg p-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {!token && (
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
