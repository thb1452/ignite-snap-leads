import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLead, usePipelineStages, useUpdateLeadStage, useArchiveLead, useCrmEvidence } from '@/hooks/useLeads';
import { LeadActivityTimeline } from '@/components/crm/LeadActivityTimeline';
import { LeadWorkEditor, LeadContacts, ManualOutcome } from '@/components/crm/CrmLeadWorkspace';
import { propertyLink } from '@/services/crmModel';
import SEOHead from '@/components/SEOHead';

export default function CrmLeadDetail() {
  const {id}=useParams<{id:string}>(); const query=useLead(id);const lead=query.data;
  const stages=usePipelineStages();const evidence=useCrmEvidence(lead);const move=useUpdateLeadStage();const archive=useArchiveLead();
  const property=evidence.data?.kind==='property'?evidence.data.property:null;
  return <AppLayout>
    <SEOHead title="Lead Detail | Snap Ignite CRM" description="Private lead notes, contacts and next actions." canonical="/crm/leads"/>
    <div className="px-4 md:px-6 py-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" asChild><Link to="/crm/pipeline">← Back to Pipeline</Link></Button>{lead&&<Button variant="outline" disabled={archive.isPending} onClick={()=>archive.mutate({leadId:lead.id,restore:!!lead.archived_at})}>{lead.archived_at?'Restore lead':'Archive lead'}</Button>}</div>
      {query.isLoading?<Skeleton className="h-32"/>:query.isError?<Card className="p-6" role="alert"><p>We could not load this lead. No changes have been confirmed.</p><Button variant="outline" onClick={()=>query.refetch()}>Retry</Button></Card>:!lead?<Card className="p-8">This lead was not found or is not available to this account.</Card>:<>
      <div><h1 className="text-2xl font-semibold">{lead.title||property?.address||'Saved property'}</h1><p className="text-sm text-muted-foreground">Private label · Lead {lead.id.slice(0,8)}</p>{lead.contact_restricted&&<Badge variant="destructive">Do not contact — restriction recorded</Badge>}{lead.archived_at&&<Badge variant="secondary">Archived — restore before recording work</Badge>}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Property evidence</CardTitle></CardHeader><CardContent className="space-y-3">
            {evidence.isLoading?<p>Checking current evidence access…</p>:evidence.isError?<div role="status"><p>Source evidence is unavailable or its permission has expired. Your private contacts, notes and follow-up history remain below.</p><Button variant="outline" size="sm" onClick={()=>evidence.refetch()}>Check access again</Button></div>
            :evidence.data?.kind==='source'?evidence.data.rows.map((row,i)=><div key={i} className="space-y-2"><p className="font-medium">{row.address}, {row.city}, {row.state}</p><p className="text-sm">Reviewed historical snapshot · {row.scope}</p><p className="text-xs text-muted-foreground">A source snapshot is not proof of current condition or seller intent. Collection time is separate from the event date.</p>{row.events.map(event=><details key={event.record_key} className="border p-3 rounded-md text-sm"><summary>Case opened {event.case_opened_date||'not supplied'} · {event.status_as_collected||'status not supplied'}</summary><p>{event.case_opened_date_meaning}</p><p>Violation date: {event.violation_date||'not supplied'} · Collected: {event.collected_at||'not supplied'}</p><pre className="whitespace-pre-wrap font-sans text-xs mt-2">{event.source_original_text}</pre></details>)}</div>)
            :property?<><p>{property.address}, {property.city}, {property.state} {property.zip}</p><Button variant="outline" size="sm" asChild><Link to={propertyLink(property.id)}>View full property</Link></Button></>:<p className="text-sm text-muted-foreground">Property evidence is not currently available. Your private work is preserved.</p>}
          </CardContent></Card>
          <LeadWorkEditor key={lead.id} lead={lead}/>
          <ManualOutcome key={lead.id} lead={lead}/>
          <LeadActivityTimeline key={lead.id} leadId={lead.id}/>
        </div>
        <div className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Stage</CardTitle></CardHeader><CardContent>
            {stages.isError?<p role="alert">Stages could not be loaded.</p>:<><label className="sr-only" htmlFor="lead-stage">Pipeline stage</label><select id="lead-stage" className="w-full border rounded-md p-2 bg-background" value={lead.stage_id} disabled={move.isPending||!!lead.archived_at} onChange={e=>move.mutate({leadId:lead.id,stageId:e.target.value})}>{stages.data?.map(stage=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></>}
            {move.isError&&<p role="alert" className="text-sm text-destructive">The stage change failed. Please retry.</p>}
          </CardContent></Card>
          <LeadContacts key={lead.id} lead={lead}/>
          <Card className="p-4 text-sm space-y-2"><p>Assigned to you</p><p>Last reached: {lead.last_contacted_at?new Date(lead.last_contacted_at).toLocaleString():'Not recorded'}</p><p className="text-xs text-muted-foreground">Contact attempts do not count as a successful conversation.</p></Card>
        </div>
      </div></>}
    </div>
  </AppLayout>;
}
