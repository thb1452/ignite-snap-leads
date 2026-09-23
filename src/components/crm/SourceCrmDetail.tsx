import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {loadSourceCrmDetail,type SourceCrmGroup} from '@/services/sourceCrmDetail';
import type {SourceActionRpc} from '@/services/sourceActions';
type Props={actor:string;leadId:string;propertyId:string};
export function SourceCrmDetail(props:Props){return <SourceCrmSession key={`${props.actor}:${props.leadId}:${props.propertyId}`} {...props}/>;}
function SourceCrmSession({actor,leadId,propertyId}:Props){
  const [groups,setGroups]=useState<SourceCrmGroup[]|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;setGroups(null);setError(false);
    loadSourceCrmDetail(supabase as unknown as SourceActionRpc,actor,leadId,propertyId,controller.signal).then(result=>{
      if(alive&&!controller.signal.aborted)setGroups(result);
    }).catch(()=>{if(alive&&!controller.signal.aborted)setError(true);});
    return()=>{alive=false;controller.abort();};
  },[actor,leadId,propertyId,revision]);
  return <section className="rounded-lg border bg-card p-5 space-y-4" aria-label="Approved source details">
    <h2 className="text-xl font-semibold">Reviewed source snapshot</h2>
    <p className="text-sm text-muted-foreground">Dated agency records preserved with this CRM lead. They do not establish current conditions, a new filing or an affected unit.</p>
    {error?<p role="alert">These source details are unavailable or their approval has expired. No records were changed.</p>:!groups?<p role="status">Checking the current source approval…</p>:groups.map(group=><div key={`${group.acceptanceId}:${group.mappingId}`} className="space-y-3">
      <div><h3 className="font-semibold">{group.address}</h3><p className="text-sm">{group.city}, {group.state} {group.zip}</p></div>
      {group.events.map(event=><article key={event.recordKey} className="border rounded p-3 space-y-2 text-sm">
        <p><strong>Agency case {event.caseId}</strong> · {event.status??'Status not supplied'} when collected</p>
        <p>{event.description??'Description not supplied by the source.'}</p>
        <p>Collected {event.collectedAt}. Case opened: {event.caseOpened??'Not supplied'}. Violation date: {event.violationDate??'Not supplied'}.</p>
        <p><a className="underline" href={event.sourceUrl} target="_blank" rel="noopener noreferrer">Agency source</a> · <a className="underline" href={event.termsUrl} target="_blank" rel="noopener noreferrer">Source terms</a></p>
        {event.attribution&&<p>{event.attribution}</p>}
        {event.sourceNotice&&<p>{event.sourceNotice}</p>}
        <details><summary className="cursor-pointer">Original record and references</summary><div className="space-y-2 mt-2 break-words">
          <p>Acceptance: {group.acceptanceId}. Review: {group.reviewId}. Mapping: {group.mappingId}.</p>
          <p>Delivery: {event.deliveryId}. Processing run: {event.processingRunId}. Preparation: {event.preparation}.</p>
          <p>Original SHA-256: {event.originalSha256}</p><pre className="whitespace-pre-wrap text-xs">{event.originalText}</pre>
        </div></details>
      </article>)}
      <details className="text-sm"><summary className="cursor-pointer">Original parcel evidence</summary><p className="break-words">SHA-256: {group.parcelSha256}</p><pre className="whitespace-pre-wrap text-xs">{group.parcelOriginalText}</pre></details>
    </div>)}
    <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>{setGroups(null);setError(false);setRevision(n=>n+1);}}>Recheck source approval</button>
  </section>;
}
