import {loadSourceCapabilities,type SourceCapabilities} from '@/services/sourceCapabilities';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {SourceReviewRecords} from './SourceReviewRecords';
import {loadSourceReview,REVIEW_PAGE_SIZE,type ReviewRpc,type SourceReviewEvent,type SourceReviewPage} from '@/services/sourceReview';
import {exportSourceDetailCsv} from '@/services/export';
import {acknowledgeSourceCommand,allowedDispositions,boundedSourceRequest,buildResolutions,confirmSourceActionReadback,evidenceFileHash,HASH,ID,readPending,reasonLabels,runSourceCommand,
  type Resolution,type SourceActionRpc,type SourceCommand} from '@/services/sourceActions';
import {loadSourceActionState,loadSourceAcceptanceDetail,lookupSourceConsumer,previewSourceSelection,previewSourceTarget,
  type SourceActionState,type SourceConsumer,type SourcePreview,type SourceTarget} from '@/services/sourceActionState';

const field='mt-1 block w-full rounded-md border bg-background px-3 py-2';
const button='rounded-lg border px-4 py-2 text-sm disabled:opacity-40';
const primary=button+' bg-primary text-primary-foreground';
const time=(v:string)=>new Date(v).toLocaleString();
type Proof={hash:string;note:string};
const emptyProof=():Proof=>({hash:'',note:''});
const proofValid=(p:Proof)=>HASH.test(p.hash)&&p.note.trim().length>=10&&p.note.length<=2000;
function Evidence({label,value,onChange}:{label:string;value:Proof;onChange:(p:Proof)=>void}) {
  const [name,setName]=useState(''),[error,setError]=useState(''),epoch=useRef(0),latest=useRef(value),change=useRef(onChange);latest.current=value;change.current=onChange;
  return <div className="space-y-2"><label className="block text-sm">{label} evidence file
    <input className={field} type="file" onChange={async event=>{const file=event.target.files?.[0];const current=++epoch.current;
      onChange({...value,hash:''});setName(file?.name||'');setError('');if(!file)return;
      try{const hash=await evidenceFileHash(file);if(current===epoch.current)change.current({...latest.current,hash});}
      catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'Evidence could not be checked.');}}}/></label>
    <p className="text-xs text-muted-foreground">The file is checked in this browser. Keep the original in the private archive; this control saves its fingerprint, not the file.</p>
    {name&&<p className="text-xs">{name} · {value.hash?'Fingerprint ready':'Checking file…'}</p>}{error&&<p role="alert">{error}</p>}
    <label className="block text-sm">What does this evidence establish?<textarea className={field} value={value.note} maxLength={2000}
      onChange={e=>onChange({...value,note:e.target.value})} placeholder="Describe the checked evidence and its limits."/></label>
    {value.hash&&<details className="text-xs"><summary>Evidence reference</summary><p className="break-all">{value.hash}</p></details>}
  </div>;
}
export function OwnerSourceActions({actor,preparation,page,offset,recordsBusy,onPage,onRefresh,client=supabase as unknown as SourceActionRpc,
  exportCsv=exportSourceDetailCsv}:{actor:string;preparation:string;page:SourceReviewPage|null;offset:number;recordsBusy:boolean;onPage:(n:number)=>void;onRefresh:()=>void;
  client?:SourceActionRpc;exportCsv?:(id:string)=>Promise<any>}) {
  const active=useRef<AbortController|null>(null);
  const [loadedCapabilities,setCapabilities]=useState<SourceCapabilities|null>(null);
  const alive=useRef(true),[loadedState,setState]=useState<SourceActionState|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
  const capabilities=loadedCapabilities?.actor_user_id===actor&&loadedCapabilities.preparation_sha256===preparation?loadedCapabilities:null;
  const state=loadedState?.actor_user_id===actor&&loadedState.preparation_sha256===preparation?loadedState:null;
  const [selected,setSelected]=useState<Record<string,SourceReviewEvent>>({}),[preview,setPreview]=useState<SourcePreview|null>(null);
  const [pending,setPending]=useState<ReturnType<typeof readPending>>(null),[outcome,setOutcome]=useState(''),[reviewProof,setReviewProof]=useState(emptyProof);
  const [sourceId,setSourceId]=useState(''),[mappingMode,setMappingMode]=useState(''),[targetId,setTargetId]=useState(''),[target,setTarget]=useState<SourceTarget|null>(null),[mappingProof,setMappingProof]=useState(emptyProof),[mappingConfirmed,setMappingConfirmed]=useState(false);
  const [consumerId,setConsumerId]=useState(''),[consumer,setConsumer]=useState<SourceConsumer|null>(null),[purpose,setPurpose]=useState(''),[expires,setExpires]=useState(''),[acceptProof,setAcceptProof]=useState(emptyProof);
  const [resolutions,setResolutions]=useState<Record<string,Partial<Resolution>>>({}),[applyReasons,setApplyReasons]=useState(false),[acceptConfirmed,setAcceptConfirmed]=useState(false);
  const [revoke,setRevoke]=useState(''),[revokeProof,setRevokeProof]=useState(emptyProof),[revokeConfirmed,setRevokeConfirmed]=useState(false);
  const [activeAcceptance,setActiveAcceptance]=useState(''),[detail,setDetail]=useState<any>(null),[crmSource,setCrmSource]=useState(''),[stage,setStage]=useState('');
  const records=Object.values(selected).sort((a,b)=>a.source_row-b.source_row),keys=records.map(e=>e.record_key);
  const ready=!!capabilities?.can_manage_source&&!!state?.can_administer&&state.complete&&!busy&&!pending;
  const visiblePage=page?.batch.preparation_sha256===preparation?page:null;
  const currentReview=preview&&state?.reviews.find(r=>r.current&&r.outcome==='reviewed'&&r.selection_sha256===preview.selection_sha256);
  const sourceIds=[...new Set(preview?.items.map(i=>i.source_property_id)||[])];
  const mappings=sourceIds.map(id=>state?.mappings.find(m=>m.source_property_id===id&&m.current&&!m.revoked&&
    m.source_evidence_sha256===preview?.items.find(i=>i.source_property_id===id)?.parcel_evidence_sha256)).filter(Boolean);
  const reasonList=[...new Set(records.flatMap(e=>e.review_reasons))];
  const acceptance=state?.acceptances.find(a=>a.id===activeAcceptance);
  const sourceChoices=acceptance?state?.mappings.filter(m=>acceptance.mapping_ids.includes(m.id))||[]:[];
  function selectionChanged(next:Record<string,SourceReviewEvent>){setSelected(next);setPreview(null);setSourceId('');setResolutions({});setApplyReasons(false);setAcceptConfirmed(false);}
  async function refresh(signal:AbortSignal){
    const access=await loadSourceCapabilities(client,actor,preparation,signal);
    if(alive.current&&!signal.aborted)setCapabilities(access);
    if(!access.can_manage_source){if(alive.current&&!signal.aborted)setState(null);return null;}
    const next=await loadSourceActionState(client,actor,preparation,signal);
    if(alive.current&&!signal.aborted)setState(next);return next;
  }
  async function task(label:string,fn:(signal:AbortSignal)=>Promise<void>){
    if(active.current)return;setBusy(label);setError('');setMessage('');const controller=new AbortController();active.current=controller;
    const current=()=>alive.current&&active.current===controller;
    try{await fn(controller.signal);}catch(e){if(current()){setError(e instanceof Error?e.message:'This step could not be confirmed.');setState(null);}}
    finally{if(current()){active.current=null;setBusy('');try{setPending(readPending(localStorage,actor,preparation));}catch(e){setError(e instanceof Error?e.message:'Saved action unavailable.');}}}
  }
  useEffect(()=>{alive.current=true;const controller=new AbortController();active.current=controller;
    const current=()=>alive.current&&active.current===controller;
    setState(null);setCapabilities(null);setError('');setBusy('Checking owner action access');
    if(!actor||!preparation){active.current=null;setBusy('');return()=>{alive.current=false;active.current?.abort();active.current=null;};}
    Promise.resolve().then(()=>{setPending(readPending(localStorage,actor,preparation));return refresh(controller.signal);})
      .catch(e=>{if(current())setError(e instanceof Error?e.message:'Owner access could not be checked.');})
      .finally(()=>{if(current()){active.current=null;setBusy('');}});
    return()=>{alive.current=false;active.current?.abort();active.current=null;};
  },[actor,preparation]);
  async function commit(command:SourceCommand){
    await task('Saving and checking the decision',async signal=>{
      const receipt=await runSourceCommand(client,actor,preparation,command,localStorage,navigator.locks,signal);
      const history=await refresh(signal);if(!history)throw new Error('Source permission changed. The saved decision remains available for reconciliation.');confirmSourceActionReadback(command,receipt.result,history);
      await acknowledgeSourceCommand(localStorage,navigator.locks,actor,preparation,receipt.commandId);
      if(alive.current&&!signal.aborted){setMessage('Saved decision confirmed in the server history.');setDetail(null);setAcceptConfirmed(false);setMappingConfirmed(false);setRevokeConfirmed(false);}
    });
  }
  function mapCommand():SourceCommand {
    const item=preview!.items.find(i=>i.source_property_id===sourceId)!;
    return {kind:'mapping',args:{p_preparation:preparation,p_source_property_id:sourceId,p_source_evidence_sha256:item.parcel_evidence_sha256,
      p_mode:mappingMode,p_existing_property_id:mappingMode==='reuse_existing'?target!.property_id:null,
      p_expected_target_sha256:mappingMode==='reuse_existing'?target!.target_sha256:null,p_evidence_sha256:mappingProof.hash,p_note:mappingProof.note}};
  }
  function acceptCommand():SourceCommand {
    const until=new Date(expires);if(!expires||!Number.isFinite(until.valueOf())||until.valueOf()<=Date.now()||until.valueOf()>Date.now()+366*86400000)throw new Error('Choose an explicit future expiry within one year.');
    if(!currentReview||!consumer||!sourceIds.length||mappings.length!==sourceIds.length||!acceptConfirmed)throw new Error('Verify the review, exact account and complete property mappings.');
    return {kind:'acceptance',args:{p_review_id:currentReview.id,p_consumer_user_id:consumer.user_id,p_purpose:purpose,
      p_mapping_ids:mappings.map(m=>m!.id),p_resolutions:buildResolutions(records,resolutions,applyReasons),p_evidence_sha256:acceptProof.hash,p_valid_until:until.toISOString()}};
  }
  return <div className="space-y-6">
    {visiblePage&&<SourceReviewRecords page={visiblePage} offset={offset} busy={recordsBusy||!!busy} onPage={onPage} onRefresh={onRefresh}
      selectedKeys={keys} onSelect={e=>selectionChanged(selected[e.record_key]?Object.fromEntries(Object.entries(selected).filter(([k])=>k!==e.record_key)):{...selected,[e.record_key]:e})}/>}
    <section className="rounded-xl border bg-card p-5 space-y-4" aria-label="Owner source decisions">
      <div><h2 className="text-xl font-semibold">Source decisions</h2><p className="mt-2 text-sm text-muted-foreground">Reviewing evidence, mapping a property and approving one account are separate recorded decisions. Original intake stays unchanged. Sending, tracing, SMS and public release remain held.</p></div>
      {capabilities&&<div className="rounded-lg border p-3 space-y-1 text-sm" role="status">
        <p>{capabilities.management_authority==='preparation_grant'?'You can manage this source batch under a specific permission.':capabilities.management_authority==='existing_admin'?'Your existing administrator access covers this assigned source batch.':'You can inspect this source batch. Final source-management permission has not been granted to this account.'}</p>
        {capabilities.management_authority==='preparation_grant'&&capabilities.management_expires_at&&<p>Source-management permission ends {time(capabilities.management_expires_at)}.</p>}
        <p>{capabilities.customer_access_held?'General customer access remains held. A current source permission and a separate acceptance for your own account are required for these source-only actions.':'Customer account access and export allowance are checked separately on execution.'}</p>
      </div>}
      {busy&&<div className="space-y-2"><p role="status">{busy}…</p><button className={button} onClick={()=>active.current?.abort()}>Stop waiting</button><p className="text-xs text-muted-foreground">A saved decision remains available for reconciliation if its result is uncertain.</p></div>}{error&&<p role="alert" className="rounded-lg border p-3">{error}</p>}{message&&<p role="status">{message}</p>}
      <button className={button} disabled={!!busy} onClick={()=>void task('Refreshing owner history',async s=>{await refresh(s);})}>Refresh owner history</button>
      {!state&&!busy&&<p className="text-sm">Actions stay unavailable until current owner access and server history are confirmed.</p>}
      {pending&&<div className="rounded-lg border border-amber-400 p-4 space-y-3"><p>A saved {pending.command.kind} action needs reconciliation before another action.</p>
        <p className="text-xs break-all">Saved action reference: {pending.commandId}</p>
        <button className={button} disabled={!!busy||!state?.can_administer} onClick={()=>void commit(pending.command)}>Reconcile saved action</button></div>}
      {state&&!state.complete&&<p role="alert">The complete decision history could not be checked. Refresh to load every history page before taking another action.</p>}
      {state&&<>
        <p className="text-xs text-muted-foreground">Owner access confirmed · History checked {time(state.checked_at)}</p>
        <div className="rounded-lg bg-muted/40 p-4 space-y-3"><p>{records.length} source records selected across {new Set(records.map(e=>e.property.property_id)).size} parcels.</p>
          <div className="flex flex-wrap gap-2"><button className={button} disabled={!ready||!visiblePage} onClick={()=>selectionChanged({...selected,...Object.fromEntries(visiblePage!.events.map(e=>[e.record_key,e]))})}>Select displayed records</button>
            <button className={button} disabled={!ready||!visiblePage} onClick={()=>void task('Loading this batch for selection',async signal=>{
              const all:Record<string,SourceReviewEvent>={};let next:number|null=0;
              while(next!==null){const p=await boundedSourceRequest(signal,requestSignal=>loadSourceReview(client as unknown as ReviewRpc,preparation,next!,requestSignal));for(const e of p.events)all[e.record_key]=e;next=p.next_offset;if(Object.keys(all).length>2000)throw new Error('This selection exceeds the review limit.');}
              if(alive.current&&!signal.aborted)selectionChanged(all);
            })}>Select all records in this batch</button>
            <button className={button} disabled={!!busy} onClick={()=>selectionChanged({})}>Clear selection</button>
            <button className={button} disabled={!ready||!keys.length} onClick={()=>void task('Checking selected evidence',async signal=>{
              const p=await previewSourceSelection(client,actor,preparation,keys,signal);if(alive.current&&!signal.aborted){setPreview(p);setMessage('Selection checked. This has not approved customer access.');}
            })}>Check selected evidence</button></div>
          {preview&&<p className="text-sm">The server matched {preview.items.length} original records and {sourceIds.length} dated parcel identities.</p>}
        </div>
        <details className="rounded-lg border p-4" open={!!preview}><summary className="cursor-pointer font-semibold">1. Record an evidence review</summary>
          <div className="mt-4 space-y-3"><label className="block text-sm">Review outcome<select className={field} value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">Choose an outcome</option><option value="reviewed">Evidence reviewed</option><option value="held">Hold these records</option><option value="rejected">Reject these records</option></select></label>
            <Evidence label="Review" value={reviewProof} onChange={setReviewProof}/>
            <p className="text-sm">This records what you reviewed. It does not grant a customer or CRM permission.</p>
            <button className={primary} disabled={!ready||!preview||!outcome||!proofValid(reviewProof)} onClick={()=>void commit({kind:'review',args:{p_preparation:preparation,p_record_keys:keys,p_expected_selection_sha256:preview!.selection_sha256,p_outcome:outcome,p_evidence_sha256:reviewProof.hash,p_note:reviewProof.note}})}>Save evidence review</button>
          </div></details>
        <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">2. Connect exact property identities</summary><div className="mt-4 space-y-3">
          <p className="text-sm">{mappings.length} of {sourceIds.length} selected parcels have a current mapping. A match must use source parcel evidence; an address alone does not establish identity.</p>
          <label className="block text-sm">Source parcel<select className={field} value={sourceId} onChange={e=>{setSourceId(e.target.value);setMappingConfirmed(false);}}><option value="">Choose a checked parcel</option>{sourceIds.map(id=><option key={id} value={id}>{records.find(e=>e.property.property_id===id)?.property.address} · {preview?.items.find(i=>i.source_property_id===id)?.source_parcel_reference}</option>)}</select></label>
          <label className="block text-sm">Connection<select className={field} value={mappingMode} onChange={e=>{setMappingMode(e.target.value);setTarget(null);setMappingConfirmed(false);}}><option value="">Choose explicitly</option><option value="create_source_identity">Create a private source property record</option><option value="reuse_existing">Use a reviewed existing customer property</option></select></label>
          {mappingMode==='reuse_existing'&&<><label className="block text-sm">Existing property reference<input className={field} value={targetId} onChange={e=>{setTargetId(e.target.value.trim().toLowerCase());setTarget(null);setMappingConfirmed(false);}}/></label>
            <button className={button} disabled={!ready||!ID.test(targetId)} onClick={()=>void task('Checking existing property',async signal=>{const p=await previewSourceTarget(client,actor,preparation,targetId,signal);if(alive.current&&!signal.aborted)setTarget(p);})}>Check existing property</button>
            {target&&<p className="text-sm">{target.address}, {target.city}, {target.state} {target.zip} · {target.supported_scope?'Supported source scope':'Unsupported scope; mapping held'}{target.already_mapped?' · An existing source mapping needs review':''}</p>}</>}
          <Evidence label="Property match" value={mappingProof} onChange={setMappingProof}/>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={mappingConfirmed} onChange={e=>setMappingConfirmed(e.target.checked)}/>I checked this exact parcel and the selected customer-property connection.</label>
          <button className={primary} disabled={!ready||!sourceId||!mappingConfirmed||!proofValid(mappingProof)||!mappingMode||mappingMode==='reuse_existing'&&!target?.supported_scope} onClick={()=>void commit(mapCommand())}>Save this property mapping</button>
        </div></details>
        <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">3. Resolve flags and approve one account</summary><div className="mt-4 space-y-4">
          <p className="text-sm">{currentReview?'Current evidence review is recorded.':'Record a reviewed outcome for this exact checked selection first.'} {mappings.length===sourceIds.length&&sourceIds.length?'All selected parcel mappings are current.':'Complete the selected parcel mappings before approval.'}</p>
          <label className="block text-sm">Existing account reference<input className={field} value={consumerId} onChange={e=>{setConsumerId(e.target.value.trim().toLowerCase());setConsumer(null);setAcceptConfirmed(false);}}/></label>
          <div className="flex gap-2"><button className={button} disabled={!ready} onClick={()=>{setConsumerId(actor);setConsumer(null);setAcceptConfirmed(false);}}>Use my signed-in account</button>
            <button className={button} disabled={!ready||!ID.test(consumerId)} onClick={()=>void task('Checking exact account',async signal=>{const c=await lookupSourceConsumer(client,actor,preparation,consumerId,signal);if(alive.current&&!signal.aborted){setConsumer(c);setStage('');}})}>Verify account and CRM stages</button></div>
          {consumer&&<p className="text-sm">Verified account: {consumer.label}{consumer.email?' ('+consumer.email+')':''} · {consumer.subscription.mode==='payg'?'Available credits will be checked at export':consumer.subscription.current?'Subscription dates are current; remaining allowance is checked at export':'Current subscription dates are unverified; export remains held'}{consumer.customer_access_held?' · General customer access remains held; exact source acceptance is checked separately':''}</p>}
          <label className="block text-sm">Approve for<select className={field} value={purpose} onChange={e=>{setPurpose(e.target.value);setAcceptConfirmed(false);}}><option value="">Choose one purpose</option><option value="customer_export">Private source-detail export</option><option value="crm">Internal CRM handoff</option></select></label>
          <label className="block text-sm">Approval expires<input className={field} type="datetime-local" value={expires} onChange={e=>{setExpires(e.target.value);setAcceptConfirmed(false);}}/></label>
          {reasonList.map(reason=>{const d=resolutions[reason]||{};return <div className="rounded-lg border p-4 space-y-3" key={reason}><h4 className="font-medium">{reasonLabels[reason]||reason.replace(/_/g,' ')}</h4>
            <p className="text-xs text-muted-foreground">Applies to {records.filter(e=>e.review_reasons.includes(reason)).length} selected records.</p>
            <label className="block text-sm">Decision<select className={field} value={d.disposition||''} onChange={e=>{setResolutions({...resolutions,[reason]:{...d,disposition:e.target.value as Resolution['disposition']}});setApplyReasons(false);}}><option value="">Choose after review</option>{allowedDispositions(reason).map(v=><option key={v} value={v}>{v==='verified'?'Verified with evidence':v==='retained_limitation'?'Retain this stated limitation':'Recheck account permission at export'}</option>)}</select></label>
            <Evidence label="This flag" value={{hash:d.evidence_sha256||'',note:d.note||''}} onChange={p=>{setResolutions({...resolutions,[reason]:{...d,evidence_sha256:p.hash,note:p.note}});setApplyReasons(false);}}/>
          </div>;})}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={applyReasons} onChange={e=>setApplyReasons(e.target.checked)}/>I reviewed these decisions for every selected record. Records needing a different decision were excluded from this selection.</label>
          <Evidence label="Account approval" value={acceptProof} onChange={setAcceptProof}/>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={acceptConfirmed} onChange={e=>setAcceptConfirmed(e.target.checked)}/>Approve only these {records.length} records for the verified account, purpose and expiry shown above.</label>
          <button className={primary} disabled={!ready||!currentReview||!consumer||!purpose||!expires||!applyReasons||!acceptConfirmed||!proofValid(acceptProof)||mappings.length!==sourceIds.length} onClick={()=>{try{void commit(acceptCommand());}catch(e){setError(e instanceof Error?e.message:'Complete the approval evidence.');}}}>Save this account approval</button>
        </div></details>
        <details className="rounded-lg border p-4" open><summary className="cursor-pointer font-semibold">4. Saved approvals, private export and CRM</summary><div className="mt-4 space-y-3">
          {!state.acceptances.length&&<p className="text-sm">No account approvals have been recorded for this batch.</p>}
          {state.acceptances.map(a=><article className="rounded-lg border p-3 space-y-2" key={a.id}><p className="font-medium">{a.consumer_label} · {a.purpose==='crm'?'CRM':'Private export'} · {a.record_keys.length} source records</p>
            <p className="text-sm">{a.current?'Current':'Unavailable: '+(a.unavailable_reason||'Review required')} · Expires {time(a.valid_until)}</p>
            <button className={button} disabled={!!busy} onClick={()=>void task('Loading saved approval evidence',async signal=>{const d=await loadSourceAcceptanceDetail(client,actor,preparation,a.id,signal);if(alive.current&&!signal.aborted){setActiveAcceptance(a.id);setDetail(d);setCrmSource('');setStage('');}})}>View saved evidence</button>
            {a.purpose==='customer_export'&&<button className={button} disabled={!ready||!a.current||a.consumer_user_id!==actor} onClick={()=>void task('Downloading private source details',async signal=>{const r=await exportCsv(a.id);if(alive.current&&!signal.aborted)setMessage(`${r.eventCount} dated source records downloaded across ${r.propertyCount} properties.`);})}>Download source details</button>}
            {a.consumer_user_id!==actor&&<p className="text-xs text-muted-foreground">Only the approved account can export or create its CRM handoff.</p>}
          </article>)}
          {detail&&acceptance&&<div className="rounded-lg bg-muted/40 p-4 space-y-3"><h4 className="font-medium">Saved approval evidence</h4><p className="text-sm">Approval {acceptance.id} · Original review {acceptance.review_event_id}</p>
            <SavedEvidence value={detail}/>
            {acceptance.purpose==='crm'&&<><label className="block text-sm">Approved source property<select className={field} value={crmSource} onChange={e=>setCrmSource(e.target.value)}><option value="">Choose one property</option>{sourceChoices.map(m=><option value={m.source_property_id} key={m.id}>{m.source_address} → {m.target_address}</option>)}</select></label>
              <p className="text-sm">Verify this approval’s account above to load its existing CRM stages. Handoff adds a dated source annotation, without contacting anyone.</p>
              <label className="block text-sm">Existing CRM stage<select className={field} value={stage} onChange={e=>setStage(e.target.value)}><option value="">Choose a stage</option>{consumer?.user_id===acceptance.consumer_user_id&&consumer.stages.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
              <button className={primary} disabled={!ready||!acceptance.current||acceptance.consumer_user_id!==actor||consumer?.user_id!==actor||!crmSource||!stage} onClick={()=>void commit({kind:'crm',args:{p_acceptance_id:acceptance.id,p_source_property_id:crmSource,p_stage_id:stage}})}>Create or recover the CRM handoff</button></>}
          </div>}
          {state.crm_links.map(link=><p className="text-xs break-all" key={link.id}>Saved CRM handoff: {link.lead_id} · {time(link.created_at)}</p>)}
        </div></details>
        <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">Revoke a mapping or account approval</summary><div className="mt-4 space-y-3">
          <p className="text-sm">Revocation is appended to history. Original records and earlier receipts stay preserved; future use is rechecked.</p>
          <label className="block text-sm">Saved decision<select className={field} value={revoke} onChange={e=>{setRevoke(e.target.value);setRevokeConfirmed(false);}}><option value="">Choose a decision</option>
            {state.mappings.filter(m=>!m.revoked).map(m=><option key={m.id} value={'mapping:'+m.id}>Mapping: {m.source_address} → {m.target_address}</option>)}
            {state.acceptances.filter(a=>!state.revocations.some(r=>r.kind==='acceptance'&&r.target_id===a.id)).map(a=><option key={a.id} value={'acceptance:'+a.id}>Approval: {a.consumer_label} · {a.purpose==='crm'?'CRM':'Private export'} · {a.record_keys.length} records</option>)}</select></label>
          <Evidence label="Revocation" value={revokeProof} onChange={setRevokeProof}/><label className="flex gap-2 text-sm"><input type="checkbox" checked={revokeConfirmed} onChange={e=>setRevokeConfirmed(e.target.checked)}/>Revoke this specific saved decision.</label>
          <button className={button} disabled={!ready||!revoke||!revokeConfirmed||!proofValid(revokeProof)} onClick={()=>void commit({kind:'revocation',args:{p_kind:revoke.split(':')[0],p_target_id:revoke.split(':')[1],p_evidence_sha256:revokeProof.hash,p_note:revokeProof.note}})}>Record revocation</button>
        </div></details>
        <details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">Review and revocation history</summary><div className="mt-3 space-y-2 text-sm">
          {state.reviews.map(r=><p key={r.id}>{r.outcome} · {r.record_keys.length} records · {time(r.created_at)} · {r.note}</p>)}
          {state.revocations.map(r=><p key={r.id}>Revoked {r.kind} · {time(r.created_at)} · {r.note}</p>)}
        </div></details>
      </>}
    </section>
  </div>;
}
function SavedEvidence({value}:{value:any}) {
  const resolutions=value.resolutions||value.acceptance?.resolutions;
  if(!resolutions||typeof resolutions!=='object')return <p className="text-sm">Detailed resolution fields are unavailable in this response.</p>;
  return <div className="space-y-2">{Object.entries(resolutions).map(([key,items])=><details key={key} className="text-sm"><summary className="cursor-pointer">Source record {key.slice(0,12)} · {(items as any[]).length} saved decisions</summary>
    {(Array.isArray(items)?items:[]).map((r:any)=><p className="mt-2" key={r.reason}>{reasonLabels[r.reason]||r.reason} · {String(r.disposition||'Unverified').replace(/_/g,' ')} · {r.note}</p>)}</details>)}</div>;
}

