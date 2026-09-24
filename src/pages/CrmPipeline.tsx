import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeads, usePipelineStages, useUpdateLeadStage } from '@/hooks/useLeads';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { dueBucket } from '@/services/crmModel';
import { exportPrivateCrm, type Lead } from '@/services/leads';
import SEOHead from '@/components/SEOHead';
import { ReceiptCaseBrowser } from '@/components/crm/ReceiptCaseBrowser';

type View = 'pipeline'|'today'|'overdue'|'archived';
function LeadCard({lead}:{lead:Lead}) {
  return <Card className="p-3 space-y-1 hover:shadow-md">
    <p className="font-medium">{lead.title || 'Saved property'} <span className="text-xs text-muted-foreground">· {lead.id.slice(0,8)}</span></p>
    <p className="text-sm">{lead.next_action || 'No next action scheduled'}</p>
    {lead.next_follow_up_at && <p className={`text-xs ${dueBucket(lead.next_follow_up_at)==='overdue'?'text-destructive':'text-muted-foreground'}`}>{new Date(lead.next_follow_up_at).toLocaleString()}</p>}
    {lead.priority>0 && <Badge variant="outline">Priority {lead.priority}</Badge>}
  </Card>;
}
export default function CrmPipeline() {
  const stages=usePipelineStages(); const leads=useLeads(); const move=useUpdateLeadStage();
  const {user}=useAuth(); const {toast}=useToast(); const [view,setView]=useState<View>('pipeline');
  const [exporting,setExporting]=useState(false);
  const [clock,setClock]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),60000);return()=>clearInterval(timer);},[]);
  const active=(leads.data??[]).filter(l=>!l.archived_at);
  const visible=useMemo(()=>(leads.data??[]).filter(l=>view==='archived'?!!l.archived_at:!l.archived_at&&(view==='pipeline'||dueBucket(l.next_follow_up_at,clock)===view)).sort((a,b)=>(a.next_follow_up_at??'z').localeCompare(b.next_follow_up_at??'z')),[leads.data,view,clock]);
  async function download() {
    if(!user)return;setExporting(true);
    try {
      const csv=await exportPrivateCrm(user.id); const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='snap-private-lead-summary.csv';a.click();URL.revokeObjectURL(url);
    } catch(error) {toast({title:'Export failed',description:error instanceof Error?error.message:'Try again.',variant:'destructive'});} finally {setExporting(false);}
  }
  return <AppLayout>
    <SEOHead title="Pipeline | Snap Ignite CRM" description="Your private property research and follow-up workspace." canonical="/crm/pipeline" />
    <PageHeader title="Pipeline" description="Pick the next useful action. Open a lead to record work, contacts and deal assumptions." />
    <div className="px-4 md:px-6 pb-8 space-y-4">
      <ReceiptCaseBrowser/>
      <div className="flex flex-wrap gap-2" aria-label="Pipeline views">
        {(['pipeline','today','overdue','archived'] as View[]).map(v=><Button key={v} variant={view===v?'default':'outline'} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='pipeline'?'All active':v[0].toUpperCase()+v.slice(1)}{['today','overdue'].includes(v)?` (${active.filter(l=>dueBucket(l.next_follow_up_at,clock)===v).length})`:''}</Button>)}
        <Button variant="outline" disabled={exporting||!leads.data?.length} onClick={download}>Export private lead summary</Button>
      </div>
      <p className="text-xs text-muted-foreground">Due times use your device timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Complete CRM contacts and history are included in your account data export.</p>
      {leads.isError||stages.isError?<Card className="p-6" role="alert"><p>We could not load your private pipeline. This is not an empty-pipeline result.</p><Button variant="outline" onClick={()=>{leads.refetch();stages.refetch();}}>Retry</Button></Card>
      :leads.isLoading||stages.isLoading?<Skeleton className="h-64 w-full"/>
      :!leads.data?.length?<Card className="p-8 space-y-3"><p>No leads saved yet. Open a property you can access and choose Add to Pipeline.</p><Button asChild><Link to="/properties">Browse properties</Link></Button></Card>
      :view!=='pipeline'?<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{visible.length?visible.map(lead=><Link key={lead.id} to={`/crm/leads/${lead.id}`}><LeadCard lead={lead}/></Link>):<p className="text-muted-foreground p-4">No {view} leads.</p>}</div>
      :!stages.data?.length?<Card className="p-6">Pipeline stages are unavailable. Contact support before adding leads.</Card>
      :<div className="flex gap-4 overflow-x-auto pb-4">{stages.data.map(stage=><section key={stage.id} className="w-[280px] shrink-0" aria-label={stage.name} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(active.some(l=>l.id===id)&&!move.isPending)move.mutate({leadId:id,stageId:stage.id});}}>
        <h2 className="font-medium flex gap-2 items-center mb-2"><span className="w-2 h-2 rounded-full" style={{backgroundColor:stage.color}}/>{stage.name}<Badge variant="secondary">{visible.filter(l=>l.stage_id===stage.id).length}</Badge></h2>
        <div className="space-y-2 bg-muted/30 rounded-lg p-2 min-h-64">{visible.filter(l=>l.stage_id===stage.id).map(lead=><Link key={lead.id} to={`/crm/leads/${lead.id}`} className="block" draggable onDragStart={e=>e.dataTransfer.setData('text/plain',lead.id)}><LeadCard lead={lead}/></Link>)}</div>
      </section>)}</div>}
      <p className="text-xs text-muted-foreground">Use the stage selector inside a lead on touchscreens or with a keyboard. Dragging is optional.</p>
    </div>
  </AppLayout>;
}
