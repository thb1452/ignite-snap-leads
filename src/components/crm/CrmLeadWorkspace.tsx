import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useUpdateLead, useCrmContacts, useSaveCrmContact, useRecordOutcome } from '@/hooks/useLeads';
import { crmKey, nextActionInput, toLocalInput, parseMoney, validateContact, OUTCOMES, outcomeLabel, type Outcome } from '@/services/crmModel';
import { hasOutcomeReceipt, type Lead, type CrmContact, type ContactInput } from '@/services/leads';
import { useAuth } from '@/components/auth/AuthProvider';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { readOutcomeRecovery, saveOutcomeAttempt, clearOutcomeAttempt, isOutcomeVersionConflict, type OutcomeRecovery } from '@/services/crmOutcomeRecovery';

export function LeadWorkEditor({lead}:{lead:Lead}) {
  const [title,setTitle]=useState(lead.title??'');const [action,setAction]=useState(lead.next_action??'');const [due,setDue]=useState(toLocalInput(lead.next_follow_up_at));
  const [value,setValue]=useState(String(lead.estimated_value??''));const [repairs,setRepairs]=useState(String(lead.estimated_repairs??''));const [offer,setOffer]=useState(String(lead.offer_amount??''));
  const [deadline,setDeadline]=useState(lead.contract_deadline??'');const [priority,setPriority]=useState(lead.priority);const [expected,setExpected]=useState(lead.updated_at);const [error,setError]=useState('');
  const save=useUpdateLead();
  const needsReload=lead.updated_at!==expected;
  function reloadLatest(){setTitle(lead.title??'');setAction(lead.next_action??'');setDue(toLocalInput(lead.next_follow_up_at));setValue(String(lead.estimated_value??''));setRepairs(String(lead.estimated_repairs??''));setOffer(String(lead.offer_amount??''));setDeadline(lead.contract_deadline??'');setPriority(lead.priority);setExpected(lead.updated_at);setError('');save.reset();}
  function submit(e:React.FormEvent){e.preventDefault();setError('');try{
    if(title.trim().length>240)throw new Error('Keep the private label under 240 characters.');
    const next=nextActionInput(action,due);
    save.mutate({leadId:lead.id,expected,updates:{title:title.trim()||null,...next,estimated_value:parseMoney(value),estimated_repairs:parseMoney(repairs),offer_amount:parseMoney(offer),contract_deadline:deadline||null,priority}},{onSuccess:row=>setExpected(row.updated_at)});
  }catch(err){setError(err instanceof Error?err.message:'Check your entries.');}}
  return <Card><CardHeader><CardTitle className="text-base">Next action & deal assumptions</CardTitle></CardHeader><CardContent>
    <form onSubmit={submit} className="space-y-3">
      {needsReload&&<div role="status" className="rounded-md border p-3 text-sm space-y-2"><p>This lead has a newer saved version. Reload the latest values before saving; your current unsaved edits will be replaced.</p><Button type="button" variant="outline" onClick={reloadLatest}>Reload latest values</Button></div>}
      <div><Label htmlFor="crm-title">Private label or address</Label><Input id="crm-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={240}/></div>
      <div><Label htmlFor="crm-next">Next action</Label><Input id="crm-next" value={action} onChange={e=>setAction(e.target.value)} maxLength={500} placeholder="Review the source record"/></div>
      <div><Label htmlFor="crm-due">Due date & time</Label><Input id="crm-due" type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/><p className="text-xs text-muted-foreground">Device timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p></div>
      <div><Label htmlFor="crm-priority">Priority</Label><select id="crm-priority" className="w-full border rounded-md p-2 bg-background" value={priority} onChange={e=>setPriority(Number(e.target.value))}><option value={0}>Normal</option><option value={1}>Important</option><option value={2}>Urgent</option></select></div>
      <div className="grid sm:grid-cols-3 gap-3">{[['Estimated value ($)',value,setValue],['Repairs estimate ($)',repairs,setRepairs],['Offer amount ($)',offer,setOffer]].map(([label,current,setter],i)=><div key={String(label)}><Label htmlFor={`crm-money-${i}`}>{String(label)}</Label><Input id={`crm-money-${i}`} inputMode="decimal" value={String(current)} onChange={e=>(setter as (s:string)=>void)(e.target.value)}/></div>)}</div>
      <p className="text-xs text-muted-foreground">Your estimates, not valuations or predicted profit. No automated offer or profitability calculation is used.</p>
      <div><Label htmlFor="crm-deadline">Contract deadline</Label><Input id="crm-deadline" type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></div>
      {(error||save.isError)&&<p role="alert" className="text-sm text-destructive">{error||save.error?.message}</p>}
      <Button type="submit" disabled={save.isPending||needsReload||!!lead.archived_at}>{save.isPending?'Saving…':'Save lead'}</Button>
    </form>
  </CardContent></Card>;
}
export function ManualOutcome({lead}:{lead:Lead}) {
  const {user}=useAuth();const actor=user?.id??'';const queryClient=useQueryClient();
  const [outcome,setOutcome]=useState<Outcome>('research');const [note,setNote]=useState('');const [action,setAction]=useState('');const [due,setDue]=useState('');
  const [complete,setComplete]=useState(!!lead.next_action);const [noNext,setNoNext]=useState(false);const [requestId,setRequestId]=useState(()=>crypto.randomUUID());const [error,setError]=useState('');
  const save=useRecordOutcome();const [checking,setChecking]=useState(false);
  const [recovery,setRecovery]=useState<OutcomeRecovery>(()=>{try{return readOutcomeRecovery(window.sessionStorage,actor,lead.id);}catch{return {status:'unavailable'};}});
  useEffect(()=>{const timer=setInterval(()=>{try{setRecovery(readOutcomeRecovery(window.sessionStorage,actor,lead.id));}catch{setRecovery({status:'unavailable'});}},60000);return()=>clearInterval(timer);},[actor,lead.id]);
  const attempt=recovery.status==='pending'?recovery.saved.command:null;
  const blocked=!['none','pending'].includes(recovery.status);
  function clearConfirmed(id:string){clearOutcomeAttempt(window.sessionStorage,actor,lead.id,id);setRecovery(readOutcomeRecovery(window.sessionStorage,actor,lead.id));setRequestId(crypto.randomUUID());}
  async function checkReceipt(){
    const id=recovery.status==='pending'?recovery.saved.command.requestId:recovery.status==='expired'?recovery.saved.requestId:null;
    if(!id)return;setChecking(true);setError('');
    try{if(await hasOutcomeReceipt(actor,lead.id,id)){clearConfirmed(id);queryClient.invalidateQueries({queryKey:crmKey(actor)});}else setError(recovery.status==='expired'?'The expired attempt has no visible receipt. Ask support to reconcile it before recording this outcome again.':'No saved receipt was found. Retry this exact outcome; it will not create a second activity.');}
    catch(err){setError(err instanceof Error?err.message:'The saved outcome could not be checked.');}finally{setChecking(false);}
  }
  function submit(e:React.FormEvent){e.preventDefault();setError('');try{
    if(blocked)throw new Error('Resolve the saved action before recording another outcome.');
    if(!attempt&&!noNext&&!action.trim())throw new Error('Schedule a next action or explicitly choose no follow-up.');
    const next=nextActionInput(noNext?'':action,noNext?'':due);
    const command=attempt??{leadId:lead.id,requestId,expected:lead.updated_at,outcome,note,nextAction:next.next_action,dueAt:next.next_follow_up_at,completeAction:complete};
    const saved=saveOutcomeAttempt(window.sessionStorage,actor,command);setRecovery({status:'pending',saved});
    save.mutate(saved.command,{onSuccess:()=>{clearConfirmed(command.requestId);setNote('');setAction('');setDue('');setNoNext(false);},onError:failure=>{
      // The server checks an existing request receipt before optimistic version
      // rejection. Only this RPC's explicit PT409 proves no new commit occurred.
      if(isOutcomeVersionConflict(failure)){clearConfirmed(command.requestId);queryClient.invalidateQueries({queryKey:crmKey(actor)});}
    }});
  }catch(err){setError(err instanceof Error?err.message:'Check your entries.');}}
  return <Card><CardHeader><CardTitle className="text-base">Record manual work</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="space-y-3">
    {recovery.status==='other_lead'&&<div role="status" className="text-sm"><p>A saved outcome on another lead needs reconciliation first.</p><Button asChild variant="outline"><Link to={`/crm/leads/${recovery.leadId}`}>Open saved action</Link></Button></div>}
    {recovery.status==='expired'&&<p role="status" className="text-sm">This attempt expired after 24 hours. Its private draft text has been removed. Check its saved receipt before taking another action.</p>}
    {['foreign','invalid','unavailable'].includes(recovery.status)&&<p role="alert" className="text-sm">Private recovery state could not be verified for this account. Reopen the page or contact support before recording work.</p>}
    {attempt&&<div role="status" className="text-sm border rounded-md p-3"><p className="font-medium">Unconfirmed outcome: {outcomeLabel(attempt.outcome)}</p><p className="whitespace-pre-wrap">{attempt.note}</p><p>{attempt.nextAction?`Next: ${attempt.nextAction}`:'No follow-up scheduled'}</p></div>}
    <fieldset disabled={!!attempt||blocked} className="space-y-3">
      <p className="text-xs text-muted-foreground">Records work you performed. Snap does not make a call, send a message or enroll a sequence.</p>
      {lead.next_action&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={complete} onChange={e=>setComplete(e.target.checked)}/>Complete: {lead.next_action}</label>}
      <div><Label htmlFor="crm-outcome">Outcome</Label><select id="crm-outcome" className="w-full border rounded-md p-2 bg-background" value={outcome} onChange={e=>setOutcome(e.target.value as Outcome)}>{OUTCOMES.map(o=><option key={o} value={o}>{outcomeLabel(o)}</option>)}</select></div>
      <div><Label htmlFor="crm-outcome-note">What happened?</Label><Textarea id="crm-outcome-note" value={note} maxLength={4000} onChange={e=>setNote(e.target.value)}/></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noNext} onChange={e=>setNoNext(e.target.checked)}/>No follow-up needed</label>
      {!noNext&&<><div><Label htmlFor="crm-outcome-next">Next action</Label><Input id="crm-outcome-next" value={action} onChange={e=>setAction(e.target.value)} maxLength={500}/></div><div><Label htmlFor="crm-outcome-due">Next due time</Label><Input id="crm-outcome-due" type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></div></>}
    </fieldset>
    {(error||save.isError)&&<p role="alert" className="text-sm text-destructive">{error||save.error?.message}</p>}
    {attempt&&!save.isPending&&<p className="text-sm">Retry the same saved action or check whether it was already recorded. Recovery stays in this browser tab and clears on sign-out.</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={blocked||save.isPending||checking||!!lead.archived_at}>{save.isPending?'Recording…':attempt?'Retry same outcome':'Record outcome'}</Button>
      {(attempt||recovery.status==='expired')&&<Button type="button" variant="outline" disabled={checking||save.isPending} onClick={checkReceipt}>{checking?'Checking…':'Check saved outcome'}</Button>}
    </div>
  </form></CardContent></Card>;
}

function ContactEditor({lead,contact,onDone}:{lead:Lead;contact?:CrmContact;onDone:()=>void}) {
  const [input,setInput]=useState<ContactInput>(contact??{id:crypto.randomUUID(),name:'',relationship:'owner',phone:'',email:'',source:'',do_not_contact:false,restriction_note:''});
  const [error,setError]=useState('');const save=useSaveCrmContact();
  const update=<K extends keyof ContactInput>(key:K,value:ContactInput[K])=>setInput({...input,[key]:value});
  function submit(e:React.FormEvent){e.preventDefault();setError('');try{validateContact({...input,phone:input.phone??'',email:input.email??''});save.mutate({lead,input:{...input,name:input.name.trim(),source:input.source.trim(),phone:input.phone?.trim()||null,email:input.email?.trim()||null}},{onSuccess:onDone});}catch(err){setError(err instanceof Error?err.message:'Check the contact.');}}
  return <form onSubmit={submit} className="space-y-2 border rounded-lg p-3">
    <div><Label htmlFor="contact-name">Name</Label><Input id="contact-name" value={input.name} maxLength={160} onChange={e=>update('name',e.target.value)} required/></div>
    <div><Label htmlFor="contact-role">Relationship</Label><select id="contact-role" className="w-full border rounded-md p-2 bg-background" value={input.relationship} onChange={e=>update('relationship',e.target.value as ContactInput['relationship'])}>{['owner','buyer','agent','other'].map(r=><option key={r}>{r}</option>)}</select></div>
    <div><Label htmlFor="contact-phone">Phone</Label><Input id="contact-phone" type="tel" value={input.phone??''} onChange={e=>update('phone',e.target.value)}/></div>
    <div><Label htmlFor="contact-email">Email</Label><Input id="contact-email" type="email" value={input.email??''} onChange={e=>update('email',e.target.value)}/></div>
    <div><Label htmlFor="contact-source">Where did this information come from?</Label><Input id="contact-source" value={input.source} maxLength={500} onChange={e=>update('source',e.target.value)} required/></div>
    <label className="text-sm flex gap-2"><input type="checkbox" checked={input.do_not_contact} disabled={contact?.do_not_contact} onChange={e=>update('do_not_contact',e.target.checked)}/>Do not contact</label>
    <div><Label htmlFor="contact-restriction">Restriction or permission notes</Label><Textarea id="contact-restriction" maxLength={1000} value={input.restriction_note??''} onChange={e=>update('restriction_note',e.target.value)}/></div>
    <p className="text-xs text-muted-foreground">Permission is unknown unless you have recorded evidence. Public information does not establish permission.</p>
    {(error||save.isError)&&<p role="alert" className="text-sm text-destructive">{error||save.error?.message}</p>}
    <div className="flex gap-2"><Button disabled={save.isPending}>Save contact</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
  </form>;
}
export function LeadContacts({lead}:{lead:Lead}) {
  const contacts=useCrmContacts(lead.id);const [editing,setEditing]=useState<string|null>(null);
  return <Card><CardHeader><CardTitle className="text-base">Private contacts</CardTitle></CardHeader><CardContent className="space-y-3">
    {contacts.isError?<div role="alert"><p>Contacts could not be loaded.</p><Button variant="outline" onClick={()=>contacts.refetch()}>Retry</Button></div>:contacts.isLoading?<p>Loading contacts…</p>:contacts.data?.length?contacts.data.map(c=><div key={c.id} className="border rounded-md p-3 text-sm space-y-1"><p className="font-medium">{c.name} · {c.relationship}</p>{c.do_not_contact&&<Badge variant="destructive">Do not contact</Badge>}<p>{c.phone}</p><p>{c.email}</p><p className="text-muted-foreground">Source: {c.source}</p>{c.restriction_note&&<p>{c.restriction_note}</p>}<Button variant="outline" size="sm" onClick={()=>setEditing(c.id)}>Edit contact</Button></div>):<p className="text-sm text-muted-foreground">No private contacts. Add information you have verified; enrichment is not assumed.</p>}
    {editing?<ContactEditor key={editing} lead={lead} contact={contacts.data?.find(c=>c.id===editing)} onDone={()=>setEditing(null)}/>:<Button variant="outline" onClick={()=>setEditing('new')} disabled={contacts.isError}>Add contact</Button>}
  </CardContent></Card>;
}
