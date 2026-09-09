import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { loadSourceReview, loadSourceReviewBatches, type ReviewRpc, type SourceReviewPage, type SourceReviewBatches } from '@/services/sourceReview';
import { SourceReviewRecords } from '@/components/source-review/SourceReviewRecords';

export default function OwnerSourceReview() {
  const {user, loading} = useAuth();
  const [batch, setBatch] = useState('');
  const [batches, setBatches] = useState<{userId: string; list: SourceReviewBatches} | null>(null);
  const [batchRefresh, setBatchRefresh] = useState(0);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{userId: string; batch: string; offset: number; page: SourceReviewPage} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const userId = user?.id;
  useEffect(() => { setOffset(0); setPrivacyBlocked(false); setSignOutError(null); }, [userId]);
  useEffect(() => {
    let active = true;
    setBatches(null); setBatch(''); setBatchError(null); setResult(null);
    if (!userId || privacyBlocked) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),25000);
    loadSourceReviewBatches(supabase as unknown as ReviewRpc, controller.signal)
      .then(list => {if (active) {setBatches({userId,list});setBatch(list.batches[0]?.preparation_sha256 || '');setOffset(0);}})
      .catch(reason => {if (active) setBatchError(controller.signal.aborted ? 'The batch check took too long. Please try again.' : reason instanceof Error ? reason.message : 'The assigned batches could not be loaded.');})
      .finally(() => clearTimeout(timeout));
    return () => {active=false;clearTimeout(timeout);controller.abort();};
  },[userId,privacyBlocked,batchRefresh]);
  useEffect(() => {
    let active = true;
    setResult(null); setError(null);
    if (!userId || !batch || privacyBlocked) { setBusy(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    setBusy(true);
    loadSourceReview(supabase as unknown as ReviewRpc, batch, offset, controller.signal)
      .then(page => { if (active) setResult({userId,batch,offset,page}); })
      .catch(reason => { if (active) setError(controller.signal.aborted ? 'The record check took too long. Please try again.' : reason instanceof Error ? reason.message : 'The records could not be loaded.'); })
      .finally(() => { clearTimeout(timeout); if (active) setBusy(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [userId, batch, offset, refresh, privacyBlocked]);
  // A signed-out or switched account must never render a previous account's result,
  // including the render before the request cleanup effect runs.
  const visible = !privacyBlocked && userId && result?.userId === userId && result.batch === batch && result.offset === offset ? result.page : null;
  const assigned = !privacyBlocked && userId && batches?.userId === userId ? batches.list : null;
  async function signOut() {
    setPrivacyBlocked(true); setResult(null); setBatches(null); setSignOutError(null); setSigningOut(true);
    try {
      const {error} = await supabase.auth.signOut();
      if (error) setSignOutError('Records are hidden, but sign-out did not finish. Please try signing out again.');
    } catch {setSignOutError('Records are hidden, but sign-out did not finish. Please try signing out again.');}
    finally {setSigningOut(false);}
  }
  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b"><div className="mx-auto max-w-5xl px-5 py-5 flex flex-wrap items-center justify-between gap-3">
      <a className="font-semibold tracking-tight" href="https://snap-ignite-operations.juniordorelien.chatgpt.site/">SNAP ϟ ignite <span className="ml-2 text-xs font-normal text-muted-foreground">Owner review</span></a>
      {user && <div className="flex items-center gap-3 text-sm"><span className="text-muted-foreground">{user.email}</span><button className="underline underline-offset-4" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div>}
    </div></header>
    <div className="mx-auto max-w-5xl px-5 py-8 space-y-7">
      <div><span className="rounded-full border bg-muted/50 px-3 py-1 text-xs">Private · Pending review</span><h1 className="mt-4 text-3xl font-semibold tracking-tight">Review collected records.</h1><p className="mt-2 text-muted-foreground">Original violations, property evidence, and the decisions needed before customer delivery.</p></div>
      {signOutError && <p role="alert" className="rounded-xl border p-5">{signOutError}</p>}
      {loading ? <p role="status">Checking your session…</p> : !user ? <ReviewSignIn /> : <>
        {!privacyBlocked && batchError && <div role="alert" className="rounded-xl border p-5 space-y-3"><p>{batchError}</p><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setBatchRefresh(n=>n+1)}>Refresh assigned batches</button></div>}
        {!privacyBlocked && !assigned && !batchError && <p role="status">Checking assigned batches…</p>}
        {assigned && <section className="rounded-xl border p-5 flex flex-wrap items-end gap-4 justify-between">
          {assigned.batches.length ? <label className="flex-1 text-sm min-w-0">Collection batch<select className="mt-2 block w-full rounded-md border bg-background px-3 py-2" value={batch} onChange={event=>{setBatch(event.target.value);setOffset(0);}}>{assigned.batches.map(item=><option key={item.preparation_sha256} value={item.preparation_sha256}>{new Date(item.collected_at).toLocaleString()} · {item.event_count} violations · {item.property_count} parcels</option>)}</select></label> : <p>No batches are assigned to this account.</p>}
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setBatchRefresh(n=>n+1)}>Refresh assigned batches</button>
          {assigned.truncated && <p className="w-full text-sm text-muted-foreground">Showing the latest 100 of {assigned.total_count} assigned batches.</p>}
        </section>}
        {!privacyBlocked && busy && <p role="status" className="rounded-xl border p-5">Checking the collected records…</p>}
        {!privacyBlocked && error && <div role="alert" className="rounded-xl border p-5 space-y-3"><p>{error}</p><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
        {visible && <SourceReviewRecords page={visible} offset={offset} busy={busy} onPage={setOffset} onRefresh={() => setRefresh(n => n + 1)} />}
      </>}
      <footer className="border-t pt-5 text-sm text-muted-foreground">Owner review · Customer release and export remain pending.</footer>
    </div>
  </main>;
}

function ReviewSignIn() {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [resetMode,setResetMode] = useState(false);
  const [resetRequested,setResetRequested] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (resetMode) {
        // Use the published recovery page so the email also works on another device.
        const {error} = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: 'https://ignite-snap-leads.lovable.app/reset-password',
        });
        if (error) setError('The reset email could not be requested. Please wait a minute and try again.');
        else setResetRequested(true);
        return;
      }
      const {error} = await supabase.auth.signInWithPassword({email:email.trim(),password});
      if (error) setError('Sign-in was not successful. Check your email and password.');
    } catch { setError(resetMode ? 'The reset email could not be requested. Please try again.' : 'Sign-in is unavailable. Please try again.'); }
    finally { setPassword(''); setBusy(false); }
  }
  return <section className="max-w-md rounded-xl border bg-card p-6 space-y-4">
    <div><h2 className="text-xl font-semibold">{resetMode ? 'Reset your password' : 'Sign in to review'}</h2><p className="mt-2 text-sm text-muted-foreground">{resetMode ? 'Enter your Snap account email to request a password-reset link.' : 'Use your existing Snap customer account. Only the account assigned to this batch can see its records.'}</p></div>
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm">Email<input className="mt-1 block w-full rounded-md border bg-background px-3 py-2" type="email" autoComplete="username" required value={email} onChange={e => {setEmail(e.target.value);setResetRequested(false);}} /></label>
      {!resetMode && <label className="block text-sm">Password<input className="mt-1 block w-full rounded-md border bg-background px-3 py-2" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {error && <p role="alert" className="text-sm">{error}</p>}
      {resetRequested && <p role="status" className="text-sm">If this email has a Snap account, a reset link is on its way. Check your inbox and spam folder. After resetting, return here and sign in.</p>}
      <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || (resetMode && resetRequested)}>{busy ? (resetMode ? 'Requesting link…' : 'Signing in…') : (resetMode ? 'Send reset link' : 'Sign in')}</button>
    </form>
    <button type="button" className="text-sm underline underline-offset-4" disabled={busy} onClick={() => {setResetMode(value => !value);setPassword('');setError(null);setResetRequested(false);}}>{resetMode ? 'Back to sign in' : 'Forgot password?'}</button>
  </section>;
}
