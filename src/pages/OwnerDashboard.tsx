import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, Building2, CheckCircle2, Clock3, FileCheck2, Inbox, Newspaper, RefreshCw, ShieldCheck, Waves } from 'lucide-react';
import { useOwnerSession } from '@/services/owner/session';
import { OwnerLayout } from '@/components/owner/OwnerLayout';
import { OwnerAccessGate } from '@/components/owner/OwnerAccessGate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { collectionType, knownCost, loadOperations, safeWebsite, type Feed, type Snapshot } from '@/services/owner/operations';

const sections = ['Overview', 'Collection', 'Agents', 'News outlets', 'Data quality', 'Your decisions'] as const;
type Section = typeof sections[number];
const number = (n: number | null | undefined) => n == null ? 'Unavailable' : n.toLocaleString();
const time = (value: string | null | undefined) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const readable = (value: string) => value.replace(/_/g, ' ');
function badge(status: string) {
  return <Badge variant={['failed', 'error', 'needs_review'].includes(status) ? 'destructive' : 'outline'}>{readable(status)}</Badge>;
}
function countLabel<T>(feed: Feed<T[]>) {
  return feed.data ? `Showing ${feed.data.length} of ${number(feed.total)} accessible records` : 'Feed unavailable';
}
function FeedPanel<T>({ title, feed, children, empty }: { title: string; feed: Feed<T[]>; children: (rows: T[]) => ReactNode; empty: string }) {
  return <Card><CardHeader><CardTitle className="text-lg">{title}</CardTitle>
    <p className="text-xs text-muted-foreground">{countLabel(feed)} · Checked {time(feed.checkedAt)}</p>
  </CardHeader><CardContent>
    {feed.error ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{feed.error}</p>
      : !feed.data?.length ? <p className="py-5 text-sm text-muted-foreground">{empty}</p> : children(feed.data)}
  </CardContent></Card>;
}
function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <Card><CardContent className="p-5"><div className="flex justify-between text-muted-foreground"><span className="text-sm">{label}</span>{icon}</div>
    <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}
export default function OwnerDashboard() {
  return <OwnerAccessGate><OwnerDashboardContent /></OwnerAccessGate>;
}
function OwnerDashboardContent() {
  const { user } = useOwnerSession();
  const [section, setSection] = useState<Section>('Overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const query = useQuery({
    queryKey: ['owner-operations', user?.id],
    queryFn: () => loadOperations(user!.id), enabled: !!user,
    refetchInterval: autoRefresh ? 60000 : false,
    refetchIntervalInBackground: false, refetchOnWindowFocus: false,
    staleTime: 30000, gcTime: 0, retry: false,
  });
  const data = query.data;
  return <OwnerLayout><div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><ShieldCheck className="h-4 w-4" /> Snap Ignite · Owner</div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Your operation, in one place.</h1>
        <p className="mt-2 text-muted-foreground">Collection, agents, news outlets, and the decisions that need you.</p>
      </div><div className="flex shrink-0 items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />Auto refresh</label>
        <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
    </header>
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-medium">Live worker connection · Verify activity before launch</p>
      <p className="mt-1">This view reads the working operations database. Historical tasks stay distinguishable from current activity. Mailboxes without a recorded health check remain unverified.</p>
      <p className="mt-2 text-xs">Last completed check: {time(query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString() : null)} · {autoRefresh ? 'Refreshes every minute while this page is visible.' : 'Automatic refresh is paused.'}</p>
    </div>
    <nav aria-label="Owner dashboard sections" className="flex gap-2 overflow-x-auto border-b pb-3">
      {sections.map(item => <Button key={item} variant={section === item ? 'default' : 'ghost'} aria-current={section === item ? 'page' : undefined} className="shrink-0" onClick={() => setSection(item)}>{item}</Button>)}
    </nav>
    {query.isError ? <Card><CardContent className="p-6" role="alert"><h2 className="font-semibold">The dashboard could not refresh</h2><p className="mt-2 text-sm text-muted-foreground">Your access or database connection could not be verified. Refresh to try again. Previous figures are hidden until access is confirmed.</p></CardContent></Card>
      : !data ? <p role="status" className="py-16 text-center text-muted-foreground">Loading your operation…</p>
      : <DashboardSections section={section} data={data} navigate={setSection} />}
    <footer className="flex flex-wrap justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
      <span>Owner monitoring · Connected to the worker database</span>
      <span>Customer application access is separate.</span>
    </footer>
  </div></OwnerLayout>;
}
function DashboardSections({ section, data, navigate }: { section: Section; data: Snapshot; navigate: (s: Section) => void }) {
  const cost = data.agents.data ? knownCost(data.agents.data) : null;
  const failedFeeds = [data.requests, data.agents, data.outlets, data.uploads, data.reviews, data.sentToday, data.repliesToday, data.registry, data.research, data.tasks, data.taskReviews].filter(f => f.error).length;
  const overview = section === 'Overview';
  return <div className="space-y-6">
    {overview && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Requests sent today" value={number(data.sentToday.data)} detail="Recorded sends since midnight UTC" icon={<ArrowUpRight className="h-4 w-4" />} />
        <Metric label="Replies received today" value={number(data.repliesToday.data)} detail="Recorded replies since midnight UTC" icon={<Inbox className="h-4 w-4" />} />
        <Metric label="Needs your review" value={data.reviews.error || data.taskReviews.error ? 'Unavailable' : number((data.reviews.total ?? 0) + (data.taskReviews.total ?? 0))} detail="Accessible items in the review feed" icon={<Clock3 className="h-4 w-4" />} />
        <Metric label="Recent agent cost" value={cost == null ? 'Not fully recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(cost)} detail="Displayed runs only · excludes record fees" icon={<Activity className="h-4 w-4" />} />
      </div>
      {failedFeeds > 0 && <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">{failedFeeds} feed{failedFeeds === 1 ? ' is' : 's are'} unavailable. Missing figures are not counted as zero.</p>}
      <div className="rounded-xl bg-slate-950 p-6 text-white">
        <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> First collection milestone</div>
        <p className="mt-2 text-lg font-medium">One fresh code-violation delivery. One fresh water-shutoff delivery. One sourced story draft.</p>
        <p className="mt-2 text-sm text-slate-300">Each delivery needs its original file, jurisdiction, collection date, and quality checks before it reaches customers.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate('Collection')}>View collection <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
      </div>
    </>}
    {(overview || section === 'Collection') && <Collection data={data} compact={overview} />}
    {section === 'Agents' && <FeedPanel title="Agent activity" feed={data.agents} empty="No agent runs are visible in this database. Confirm the worker connection before treating this as an idle system.">
      {rows => <div className="divide-y">{rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><p className="font-medium">{row.agent_name}</p><p className="mt-1 text-xs text-muted-foreground">Last recorded: {time(row.created_at)} · {row.duration_ms == null ? 'Duration not recorded' : `${(row.duration_ms / 1000).toFixed(1)} seconds`}</p></div>
        <div className="flex items-center gap-3"><span className="text-sm">{row.cost_usd == null ? 'Cost unknown' : '$' + row.cost_usd.toFixed(4)}</span>{badge(row.status)}</div>
      </div>)}</div>}
    </FeedPanel>}
    {section === 'Agents' && <>
      <FeedPanel title="Registered agents and heartbeats" feed={data.registry} empty="No registered agents are recorded.">
        {rows => <div className="grid gap-3 md:grid-cols-2">{rows.map(row => <article className="rounded-lg border p-4" key={row.id}><h3 className="font-medium">{row.name}</h3><p className="mt-1 text-sm text-muted-foreground">{row.role} · Registered status: {row.status}</p><p className="mt-2 text-sm">Heartbeat: {time(row.last_heartbeat)}</p><p className="mt-1 text-xs text-muted-foreground">{row.last_heartbeat ? 'Compare this timestamp with the expected worker schedule.' : 'No heartbeat evidence; not confirmed running.'}</p></article>)}</div>}
      </FeedPanel>
      <FeedPanel title="Source-discovery tasks" feed={data.tasks} empty="No source-discovery tasks are recorded.">
        {rows => <div className="divide-y">{rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{readable(row.task_type)}</p><p className="text-xs text-muted-foreground">{row.agent_role} · {row.county ?? 'County not recorded'} {row.state} · {time(row.updated_at)}</p></div>{badge(row.status)}</div>)}</div>}
      </FeedPanel>
      <FeedPanel title="Property research runs" feed={data.research} empty="No property research runs are recorded.">
        {rows => <div className="divide-y">{rows.map(row => <div key={row.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{row.county}, {row.state}</p>{badge(row.status)}</div><p className="mt-2 text-xs text-muted-foreground">Started {time(row.started_at)} · Attempted {number(row.attempted_count)} · Verified {number(row.found_verified_count)} · Third-party evidence {number(row.found_third_party_count)} · Errors {number(row.error_count)}</p></div>)}</div>}
      </FeedPanel>
    </>}
    {section === 'News outlets' && <Outlets data={data} />}
    {section === 'Data quality' && <>
      <p className="text-sm text-muted-foreground">Worker-database uploads are shown below, including historical deliveries. Processed rows are not the same as approved, unique records. Confidentiality and duplicate review need separate validator results.</p>
      <FeedPanel title="Delivered files in the worker database" feed={data.uploads} empty="No uploads are visible for your account. The worker database may hold deliveries that are not connected here yet.">
        {rows => <div className="space-y-3">{rows.map(row => <article key={row.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="break-all font-medium">{row.filename}</h3>{badge(row.status ?? 'unknown')}</div>
          <p className="mt-2 text-xs text-muted-foreground">{readable(row.source_type ?? 'Type not recorded')} · Imported {time(row.created_at)}</p>
          <div className="mt-3 flex flex-wrap gap-5 text-sm"><span>Processed rows: {number(row.processed_rows)}</span><span>Address issues: {number(row.bad_addresses)}</span><span>Finished: {time(row.finished_at)}</span></div>
        </article>)}</div>}
      </FeedPanel>
      <Setup title="Quality checks still to connect" text="Unique records delivered, duplicate review, missing dates and locations, confidentiality flags, and original-file links. Unknown values will stay unknown until the validator reports them." />
    </>}
    {(overview || section === 'Your decisions') && <FeedPanel title="Needs your attention" feed={data.reviews} empty="No review items are visible. Fee approvals, login challenges, and story reviews still need their workflow connections.">
      {rows => <div className="space-y-3">{rows.slice(0, overview ? 5 : 100).map((row, i) => <details key={`${row.domain}-${row.job_id}-${i}`} className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">{row.jurisdiction ?? readable(row.domain ?? 'Operation')} {row.state ? '· ' + row.state : ''} <span className="ml-2 text-muted-foreground">{readable(row.job_subtype ?? 'Review needed')}</span></summary>
        <p className="mt-3 text-sm">Review this item with the responsible agent before authorizing an action. No approval is submitted from this screen.</p><p className="mt-2 break-all text-xs text-muted-foreground">Reference: {row.job_id ?? 'Not recorded'} · Updated {time(row.updated_at)}</p>
      </details>)}</div>}
    </FeedPanel>}
    {(overview || section === 'Your decisions') && <FeedPanel title="Source tasks needing review" feed={data.taskReviews} empty="No failed, blocked, or stale source tasks are recorded.">
      {rows => <div className="space-y-3">{rows.slice(0, overview ? 5 : 100).map(row => <details key={row.id} className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">{readable(row.task_type)} · {row.county ?? 'County not recorded'} {row.state} <span className="ml-2">{badge(row.status)}</span></summary><p className="mt-3 text-sm">Review the last task outcome with {row.agent_role} before retrying. This dashboard does not restart jobs automatically.</p><p className="mt-2 break-all text-xs text-muted-foreground">Reference: {row.id} · Last updated: {time(row.updated_at)}</p></details>)}</div>}
    </FeedPanel>}
    {section === 'Your decisions' && <Setup title="Approval controls" text="This first version is for monitoring. Fee payments, request submissions, publication, and retries will become actionable once each control is connected to a verified workflow and an audit trail." />}
  </div>;
}
function Collection({ data, compact }: { data: Snapshot; compact: boolean }) {
  const [filter, setFilter] = useState<'all' | 'code' | 'water' | 'other'>('all');
  return <FeedPanel title="Collection queues" feed={data.requests} empty="No new collection requests are recorded. Existing research and source-discovery work appears under Agents; old VA requests are not counted as new activity.">
    {rows => {
      const visible = rows.filter(r => filter === 'all' || collectionType(r.request_type) === filter);
      return <div>
        <div className="mb-4 flex flex-wrap gap-2">{([['all', 'All requests'], ['code', 'Code violations'], ['water', 'Water shutoffs'], ['other', 'Other / unclassified']] as const).map(([key, label]) =>
          <Button size="sm" variant={filter === key ? 'default' : 'outline'} key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}>{label}</Button>)}</div>
        <p className="mb-3 text-xs text-muted-foreground">Filters apply to the latest {rows.length} jobs shown; these are not statewide totals.</p>
        {!visible.length ? <p className="py-4 text-sm text-muted-foreground">No matching jobs in the displayed records.</p> : <div className="divide-y">{visible.slice(0, compact ? 6 : 100).map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-start gap-3">{collectionType(row.request_type) === 'water' ? <Waves className="mt-1 h-5 w-5 shrink-0 text-blue-500" /> : <Building2 className="mt-1 h-5 w-5 shrink-0 text-primary" />}
            <div><p className="font-medium">{row.jurisdiction ?? 'Jurisdiction not recorded'}{row.state ? ', ' + row.state : ''}</p>
              <p className="mt-1 text-xs text-muted-foreground">{readable(row.request_type)} · Updated {time(row.updated_at)}</p>
              {!compact && <p className="mt-1 text-xs text-muted-foreground">Reply due: {time(row.response_due_at)} · Retries: {row.retry_count}</p>}
            </div></div>{badge(row.status)}</div>)}</div>}
      </div>;
    }}
  </FeedPanel>;
}
function Outlets({ data }: { data: Snapshot }) {
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">Six outlets, one operation</h2><p className="mt-2 text-sm text-muted-foreground">Registered outlets are shown below. An active database flag does not verify domain ownership, mailbox delivery, or publishing readiness.</p></div>
    <FeedPanel title="Registered news outlets" feed={data.outlets} empty="No outlets are visible in this connected database. Recover existing registrations before creating replacements.">
      {rows => <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(row => <article key={row.id} className="rounded-xl border p-5">
        <Newspaper className="mb-4 h-6 w-6 text-primary" /><h3 className="font-semibold">{row.name}</h3>
        {safeWebsite(row.domain) ? <a className="mt-1 block break-all text-sm text-primary underline" href={safeWebsite(row.domain)!} target="_blank" rel="noopener noreferrer">{row.domain}</a> : <p className="break-all text-sm">{row.domain || 'Domain not recorded'}</p>}
        <p className="mt-2 break-all text-sm">{row.email || 'Mailbox not recorded'}</p>
        <div className="mt-4">{badge(row.is_active ? 'registered_active' : 'registered_inactive')}</div>
        <p className="mt-3 text-xs text-muted-foreground">State coverage: not connected.</p>
        <p className="mt-2 text-xs text-muted-foreground">Mailbox health check: {time(row.last_health_check_at)}{!row.last_health_check_at ? ' — unverified' : ''}</p>
        <p className="mt-2 text-xs text-muted-foreground">Configured daily limit: {number(row.daily_send_limit)} · Recorded sends today: {row.last_send_reset_date === data.windowEnd.slice(0, 10) ? number(row.emails_sent_today) : 'Not verified for today'}</p>
        <p className="mt-2 text-xs text-muted-foreground">Published-story activity appears below.</p>
      </article>)}</div>}
    </FeedPanel>
    {data.outlets.data && <p className="text-sm text-muted-foreground">{number(data.outlets.total)} registered in this database · Target: 6 verified outlets. {Math.max(0, 6 - (data.outlets.total ?? data.outlets.data.length))} registrations still needed to reach six.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{data.publishing.map(site => <Card key={site.domain}><CardHeader><CardTitle className="text-lg">{site.name} · Published stories</CardTitle><p className="text-xs text-muted-foreground">{site.domain} · Checked {time(site.checkedAt)}</p></CardHeader><CardContent>
      <p className="text-sm">Website: {site.siteStatus != null && site.siteStatus >= 200 && site.siteStatus < 300 ? 'Reachable' : 'Check needed'}{site.siteStatus != null ? ' (HTTP ' + site.siteStatus + ')' : ''}</p>
      {site.error ? <p role="alert" className="mt-3 text-sm text-amber-700">{site.error}</p> : <><p className="mt-3 text-sm">{number(site.articles?.total)} publicly dated stories · Latest five below</p><ul className="mt-3 space-y-3">{site.articles?.rows.map(article => <li key={article.id}><a className="text-sm font-medium text-primary underline" href={safeWebsite(article.url) ?? undefined} target="_blank" rel="noopener noreferrer">{article.title}</a><p className="mt-1 text-xs text-muted-foreground">{time(article.publishedAt)}</p></li>)}</ul></>}
    </CardContent></Card>)}</div>
    <Setup title="Editorial review still to connect" text="The feeds above read existing public stories. Drafts, source evidence, and approval controls are separate; no stories are published automatically." />
  </div>;
}
function Setup({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-dashed p-5"><div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-muted-foreground" /><h3 className="font-medium">{title}</h3></div><p className="mt-2 text-sm text-muted-foreground">{text}</p></div>;
}
