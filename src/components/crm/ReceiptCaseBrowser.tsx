import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePipelineStages } from '@/hooks/useLeads';
import { useReceiptAcceptances, useReceiptProperties, useReceiptHandoff } from '@/hooks/useReceiptCases';
import { RECEIPT_PAGE_SIZE, receiptHandoffPlan, type ReceiptAcceptance, type ReceiptProperty, type ReceiptHandoff } from '@/services/receiptCases';
import { RECEIPT_CASE_LIMITATIONS } from '@/services/receiptCaseContract';

type HandoffAction = {open: (acceptance: ReceiptAcceptance, property: ReceiptProperty, stageId: string) => void; pending: boolean; errorKey?: string};
function ReceiptPropertyRow({property, acceptance, stageId, action}: {property: ReceiptProperty; acceptance: ReceiptAcceptance; stageId: string; action: HandoffAction}) {
  const failed = action.errorKey === `${acceptance.acceptance_id}:${property.source_property_key}`;
  return <li className="rounded-md border p-3 space-y-2">
    <p className="font-medium">{property.address}, {property.city}, {property.state}</p>
    <p className="text-sm">{property.case_count} case summaries · Report {property.report_date}</p>
    <Button size="sm" disabled={(!stageId && !property.existing_lead_id) || action.pending} onClick={() => action.open(acceptance, property, stageId)}>{action.pending ? 'Confirming…' : failed && !property.existing_lead_id ? 'Retry same handoff' : 'Open in CRM'}</Button>
    {failed && <p role="alert" className="text-sm">The handoff could not be confirmed. Retry the same request to check it; your CRM work will not be replaced.</p>}
  </li>;
}
function ReceiptProperties({acceptance, action, offset, setOffset, selectedStage, setSelectedStage}: {
  acceptance: ReceiptAcceptance; action: HandoffAction; offset: number;
  setOffset: (value: number) => void; selectedStage: string; setSelectedStage: (value: string) => void;
}) {
  const stages = usePipelineStages();
  const query = useReceiptProperties(acceptance, offset);
  const stage = stages.data?.find(row => row.id === selectedStage) ?? stages.data?.find(row => row.is_default) ?? stages.data?.[0];
  if (query.expired) return <p role="status">This snapshot access has expired. Private CRM work remains available.</p>;
  return <div className="mt-4 space-y-3">
    <label className="text-sm block">Initial stage for a new lead<select className="mt-1 block rounded-md border bg-background p-2" value={stage?.id ?? ''} onChange={event => setSelectedStage(event.target.value)} disabled={stages.isError || stages.isLoading}>
      {!stage && <option value="">Stage unavailable</option>}{stages.data?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <p className="text-xs text-muted-foreground">An existing lead keeps its stage, private label, contacts and follow-up. Source facts stay separate from your private work.</p>
    {stages.isError && <p role="alert">Pipeline stages could not be verified.</p>}
    {query.isError ? <div role="alert"><p>Snapshot properties are unavailable or access has changed.</p><Button variant="outline" onClick={() => query.refetch()}>Check access again</Button></div>
      : !query.data ? <p role="status">Checking snapshot access…</p>
      : <><ul className="grid gap-3 md:grid-cols-2">{query.data.properties.map(property => <ReceiptPropertyRow key={property.source_property_key} property={property} acceptance={acceptance} action={action} stageId={stages.isError ? '' : stage?.id ?? ''}/>)}</ul>
        {!query.data.properties.length && <p>No properties in this page.</p>}
        <div className="flex items-center gap-3"><Button variant="outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - RECEIPT_PAGE_SIZE))}>Previous</Button>
          <span className="text-sm">{query.data.total ? `${offset + 1}–${Math.min(offset + RECEIPT_PAGE_SIZE, query.data.total)} of ${query.data.total}` : '0 properties'}</span>
          <Button variant="outline" disabled={offset + RECEIPT_PAGE_SIZE >= query.data.total || offset + RECEIPT_PAGE_SIZE > 1000} onClick={() => setOffset(offset + RECEIPT_PAGE_SIZE)}>Next</Button></div></>}
  </div>;
}
function ReceiptCaseBrowserForActor() {
  const query = useReceiptAcceptances();
  const [selected, setSelected] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedStage, setSelectedStage] = useState('');
  const attempts = useRef(new Map<string, ReceiptHandoff>());
  // This observer stays mounted when source rows are hidden during revalidation.
  const handoff = useReceiptHandoff();
  const navigate = useNavigate();
  const action: HandoffAction = {
    pending: handoff.isPending,
    errorKey: handoff.isError && handoff.variables ? `${handoff.variables.acceptanceId}:${handoff.variables.propertyKey}` : undefined,
    open: (acceptance, property, stageId) => {
      const plan = receiptHandoffPlan(property, acceptance.acceptance_id, stageId, attempts.current);
      if (plan.kind === 'open') {navigate(`/crm/leads/${plan.leadId}`); return;}
      handoff.mutate(plan.command, {onSuccess: result => navigate(`/crm/leads/${result.lead_id}`)});
    },
  };
  const acceptance = query.data?.find(row => row.acceptance_id === selected);
  return <Card><CardHeader><CardTitle className="text-base">Reviewed case snapshots</CardTitle></CardHeader><CardContent className="space-y-3">
    <ul className="list-disc pl-5 text-sm text-muted-foreground">{RECEIPT_CASE_LIMITATIONS.map(item => <li key={item}>{item}</li>)}</ul>
    {query.isError ? <div role="alert"><p>We could not verify snapshot access. This does not mean your saved CRM leads are gone.</p><Button variant="outline" onClick={() => query.refetch()}>Check access again</Button></div>
      : !query.data ? <p role="status">Checking snapshot access…</p>
      : !query.data.length ? <p className="text-sm">No active reviewed snapshots are available to this account.</p>
      : <><label className="text-sm block">Available snapshot<select className="mt-1 block w-full rounded-md border bg-background p-2" value={acceptance?.acceptance_id ?? ''} onChange={event => {setSelected(event.target.value); setOffset(0);}}>
        <option value="">Choose a snapshot</option>{query.data.map(row => <option key={row.acceptance_id} value={row.acceptance_id}>{row.report_date} · {row.reviewed_count} reviewed / {row.original_count} cases · {row.evidence_kind === 'synthetic' ? 'Synthetic test records' : 'Original-backed'}</option>)}</select></label>
        {acceptance && <><p className="text-sm">{acceptance.held_count} cases held outside this subset. Access ends {new Date(acceptance.valid_until).toLocaleString()}.</p><ReceiptProperties key={acceptance.acceptance_id} acceptance={acceptance} action={action} offset={offset} setOffset={setOffset} selectedStage={selectedStage} setSelectedStage={setSelectedStage}/></>}</>}
  </CardContent></Card>;
}
export function ReceiptCaseBrowser() {
  const {user} = useAuth();
  return user ? <ReceiptCaseBrowserForActor key={user.id}/> : null;
}
