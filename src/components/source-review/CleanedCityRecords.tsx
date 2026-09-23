import { useEffect,useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadCleanedCityRecords,type CleanedCityPage,type CleanedRpc } from '@/services/cleanedCityRecords';

export function CleanedCityRecords({actor}:{actor:string}){
  const [offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false);
  const [result,setResult]=useState<{actor:string,offset:number,page:CleanedCityPage}|null>(null);
  const [error,setError]=useState<{actor:string,text:string}|null>(null);
  useEffect(()=>{setOffset(0);setResult(null);setError(null);},[actor]);
  useEffect(()=>{
    let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    setBusy(true);setResult(null);setError(null);
    loadCleanedCityRecords(supabase as unknown as CleanedRpc,offset,controller.signal)
      .then(page=>{if(active)setResult({actor,offset,page});})
      .catch(()=>{if(active)setError({actor,text:'The cleaned records could not be verified. Refresh to try again.'});})
      .finally(()=>{clearTimeout(timer);if(active)setBusy(false);});
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[actor,offset,refresh]);
  const visible=result?.actor===actor && result.offset===offset?result.page:null;
  return <section className="rounded-xl border p-5 space-y-4" aria-labelledby="cleaned-city-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="cleaned-city-heading" className="text-xl font-semibold">Cleaned city records</h2>
      <p className="mt-1 text-sm text-muted-foreground">Private source facts and investor considerations, linked to the city’s delivery.</p></div>
      <button className="rounded-lg border px-4 py-2 text-sm" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Refresh records</button></div>
    {busy && <p role="status">Checking cleaning and source evidence…</p>}
    {error?.actor===actor && <p role="alert">{error.text}</p>}
    {visible && !visible.total && <p>No cleaned city records have reached this account yet. Received files that need checking stay in the operations review queue.</p>}
    {visible?.records.map(r=><article key={r.version_id} className="rounded-lg border p-4 space-y-3">
      <div><span className="text-xs font-medium text-muted-foreground">Insight ready · Agency case</span><h3 className="mt-1 font-semibold">{r.address}, {r.city}, {r.state}</h3>
        <p className="text-sm text-muted-foreground">Case {r.case_id} · Filed {r.filed_date} · {r.status || 'Status not supplied'}</p></div>
      <p>{r.cleaned_description}</p>
      <div><h4 className="text-sm font-semibold">Possible investor consideration</h4><p className="mt-1 text-sm">{r.insight.possible_investor_implications[0].text}</p></div>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">{r.insight.limitations.map(x=><li key={x}>{x}</li>)}</ul>
      <details className="text-sm"><summary className="cursor-pointer">Source and cleaning evidence</summary><dl className="mt-2 grid gap-1 break-all">
        <div><dt className="inline font-medium">City report: </dt><dd className="inline">{r.insight.documented_facts[0].source.report_date}, rows {r.insight.documented_facts[0].source.source_rows.join('–')}</dd></div>
        <div><dt className="inline font-medium">Request: </dt><dd className="inline">{r.insight.documented_facts[0].source.request_id}</dd></div>
        <div><dt className="inline font-medium">Delivery: </dt><dd className="inline">{r.receipt_id}</dd></div>
        <div><dt className="inline font-medium">Cleaning rule: </dt><dd className="inline">{r.cleaning_rule_version}</dd></div>
      </dl></details>
    </article>)}
    {visible && visible.total>0 && <div className="flex items-center justify-between gap-3 text-sm"><span>{offset+1}–{offset+visible.records.length} of {visible.total} checked records</span><div className="flex gap-2">
      <button className="rounded-lg border px-3 py-2" disabled={busy || offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous</button>
      <button className="rounded-lg border px-3 py-2" disabled={busy || offset+25>=visible.total} onClick={()=>setOffset(n=>n+25)}>Next</button>
    </div></div>}
  </section>;
}
