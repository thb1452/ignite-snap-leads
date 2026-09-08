import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CollectionProcessing, Feed, Snapshot } from '@/services/owner/operations';
import { PrivateBackupStatus } from './PrivateBackupStatus';

const count = (value: number | null | undefined) => value == null ? 'Unavailable' : value.toLocaleString();
const time = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const reviewLabel = (state: string) => ({ pending_review: 'Pending review', reviewed: 'Review recorded', held: 'On hold', rejected: 'Rejected' }[state] ?? 'Review state unknown');
const freshnessLabel = (state: string) => ({ fresh_verified: 'Fresh source collection', historical_preserved: 'Historical file', receipt_unverified: 'Receipt needs verification' }[state] ?? 'Freshness unknown');
const recordLabel = (state: string) => state === 'code_violations' ? 'Code violations' : state === 'water_shutoff' ? 'Water shutoffs' : 'Record type unknown';

function RegisterPanel<T>({ title, feed, children, empty }: { title: string; feed?: Feed<T[]>; children: (rows: T[]) => ReactNode; empty: string }) {
  return <Card><CardHeader><CardTitle className="text-lg">{title}</CardTitle>
    <p className="text-xs text-muted-foreground">{feed?.data ? `Showing ${feed.data.length} of ${count(feed.total)} registered items` : 'Feed unavailable'} · Checked {time(feed?.checkedAt)}</p>
  </CardHeader><CardContent>{!feed || feed.error || !feed.data
    ? <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">{feed?.error || 'This register is not connected in the current dashboard response.'}</p>
    : !feed.data.length ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : children(feed.data)}</CardContent></Card>;
}

function latestRuns(data: Snapshot) {
  const latest = new Map<string, CollectionProcessing>();
  for (const run of data.collectionProcessing?.data ?? []) {
    const prior = latest.get(run.delivery_id);
    if (!prior || Date.parse(run.staged_at) > Date.parse(prior.staged_at)
      || (run.staged_at === prior.staged_at && run.id.localeCompare(prior.id) < 0)) latest.set(run.delivery_id, run);
  }
  return latest;
}

function OriginalLocations({ data, deliveryId }: { data: Snapshot; deliveryId: string }) {
  const feed = data.collectionOriginals;
  if (!feed?.data || feed.error) return <p className="text-xs text-muted-foreground">Original locations: unavailable</p>;
  const locations = new Set(feed.data.filter(row => row.delivery_id === deliveryId).map(row => row.storage_kind));
  const partial = feed.total == null || feed.total > feed.data.length;
  const local = locations.has('local'), durable = locations.has('supabase_private');
  return <div className="space-y-1 text-xs text-muted-foreground">
    <p>Original locations: {local && durable ? 'Local files and private storage copies recorded'
      : durable ? 'Private storage copies recorded'
      : local ? partial ? 'Local files recorded; other locations may be outside this view' : 'Local files only; no durable copy registered'
      : 'Not recorded in this view'}</p>
    {durable && <p>Private copy records do not yet establish a complete backup of every original.</p>}
    {partial && <p>Location list is incomplete; missing copies are not treated as absent.</p>}
  </div>;
}

export function CollectionRegister({ data }: { data: Snapshot }) {
  const latest = latestRuns(data);
  const deliveries = data.collectionDeliveries;
  const processing = data.collectionProcessing;
  const shownRuns = deliveries?.data?.map(row => latest.get(row.id));
  const candidates = !deliveries?.data || deliveries.error || !processing?.data || processing.error
    || shownRuns?.some(run => !run || !Number.isSafeInteger(run.candidate_rows) || run.candidate_rows < 0)
    ? null : (shownRuns ?? []).reduce((total, run) => total + run!.candidate_rows, 0);
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">Collection and quality register</h2>
      <p className="mt-2 text-sm text-muted-foreground">Each source collection is counted once. Reprocessing the same original creates another processing run. Candidate rows still need review before customer delivery.</p></div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        ['Fresh source collections', data.freshCollectionCount?.error ? null : data.freshCollectionCount?.data, 'Verified acquisition events in this register · all time'],
        ['Candidate rows in view', candidates, 'Latest shown run per collection · includes labeled historical files'],
        ['Accepted for customers', data.customerAcceptedCollections?.error ? null : data.customerAcceptedCollections?.data, 'Collections accepted for customer delivery · acceptance is not enabled'],
      ].map(([label, value, detail]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{count(value as number | null | undefined)}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></CardContent></Card>)}
    </div>
    <PrivateBackupStatus data={data} />
    <RegisterPanel title="Registered source collections" feed={deliveries} empty="No source collections have been registered yet. Historical uploads remain listed separately below.">
      {rows => <div className="space-y-4">{rows.map(row => {
        const run = !processing?.error ? latest.get(row.id) : undefined;
        return <article className="rounded-lg border p-4" key={row.id}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{row.source_name}</h3><p className="mt-1 text-sm text-muted-foreground">{row.jurisdiction}, {row.state} · {recordLabel(row.record_type)}</p></div><Badge variant="outline">{freshnessLabel(row.freshness)}</Badge></div>
          <p className="mt-3 text-sm">Collected {time(row.collected_at)} · Original source rows: {count(row.source_rows)}</p>
          {run ? <div className="my-3 rounded-lg bg-muted/50 p-3"><div className="flex flex-wrap items-center gap-3"><Badge variant="outline">{reviewLabel(run.review_state)}</Badge><span className="text-xs text-muted-foreground">Latest shown processing run · {time(run.staged_at)}</span></div>
            <p className="mt-2 text-sm">Candidate rows: {count(run.candidate_rows)} · Duplicate rows: {count(run.duplicate_rows)} · Held rows: {count(run.held_rows)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Observed source cases: {count(run.source_case_count)} · Candidate cases: {count(run.candidate_case_count)}. Cases and violation rows are not unique properties.</p>
          </div> : <p className="my-3 text-sm text-muted-foreground">Processing results are unavailable or outside this view.</p>}
          <OriginalLocations data={data} deliveryId={row.id} />
          <p className="mt-2 text-xs text-muted-foreground">{row.customer_accepted || row.usable_records || run?.customer_accepted || run?.usable_records ? 'Customer release flags need separate verification.' : 'Customer acceptance: not approved.'}</p>
        </article>;
      })}</div>}
    </RegisterPanel>
    {processing?.error && <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">Processing results are unavailable. Source collections remain visible.</p>}
    {processing?.data && <p className="text-xs text-muted-foreground">Showing the latest run found for each displayed collection from {processing.data.length} of {count(processing.total)} processing runs. Candidate totals are a view of those runs, not an operation-wide property count.</p>}
  </div>;
}

export function EditorialRegister({ data }: { data: Snapshot }) {
  return <RegisterPanel title="Sourced story drafts" feed={data.collectionEditorial} empty="No story drafts have been registered. Existing published-story feeds remain separate.">
    {rows => <div className="space-y-3"><p className="text-sm text-muted-foreground">These drafts are connected to collected source evidence. Editorial review and publication approval remain separate; this view cannot publish a story.</p>{rows.map(row => {
      const source = !data.collectionDeliveries?.error ? data.collectionDeliveries?.data?.find(item => item.id === row.delivery_id) : undefined;
      return <article key={row.id} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{row.title}</h3><Badge variant="outline">{row.review_state === 'pending_review' ? 'Pending editorial review' : reviewLabel(row.review_state)}</Badge></div>
        <p className="mt-2 text-sm">{row.outlet_name} · {row.published ? 'Publication state needs verification' : 'Not published'}</p>
        <p className="mt-2 text-xs text-muted-foreground">Source: {source ? `${source.source_name} · ${source.jurisdiction}, ${source.state} · Collected ${time(source.collected_at)}` : 'Collection details are outside this view or unavailable.'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Draft registered {time(row.registered_at)} · Evidence remains private pending review.</p>
      </article>;
    })}</div>}
  </RegisterPanel>;
}
