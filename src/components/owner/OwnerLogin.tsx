import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ownerClient } from '@/services/owner/client';
export function OwnerLogin() {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [creating,setCreating]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage('');
    try{
      if(creating){
        const {data,error}=await ownerClient.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+'/admin/operations'}});
        if(error)throw error;
        if(!data.session)setMessage('Check your email to confirm your account, then return here and sign in. Only the approved owner email can open the dashboard.');
      }else{
        const {error}=await ownerClient.auth.signInWithPassword({email:email.trim(),password});
        if(error)throw error;
      }
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to sign in. Try again.');}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen grid place-items-center bg-slate-950 px-5 py-12">
    <section className="w-full max-w-md rounded-2xl bg-white p-8 text-slate-900">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Snap Ignite · Owner</p>
      <h1 className="mt-3 text-2xl font-semibold">Sign in to your owner dashboard</h1>
      <p className="mt-3 text-sm text-slate-600">Use your approved owner email. This is separate from the retired VA workspace.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Email<input className="mt-1 w-full rounded-lg border p-3" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium">Password<input className="mt-1 w-full rounded-lg border p-3" type="password" autoComplete={creating?'new-password':'current-password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} /></label>
        {message&&<p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
        <Button disabled={busy} className="w-full" type="submit">{busy?'Please wait…':creating?'Create owner account':'Sign in'}</Button>
      </form>
      <button className="mt-5 text-sm text-blue-600 underline" type="button" onClick={()=>{setCreating(!creating);setMessage('');}}>{creating?'Already have an account? Sign in':'First visit? Create your account'}</button>
    </section>
  </main>;
}
