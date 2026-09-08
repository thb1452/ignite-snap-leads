import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Feed, Snapshot, StateAssignment } from '@/services/owner/operations';

const states: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};
const time = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const count = (value: number | null | undefined) => Number.isSafeInteger(value) && Number(value) >= 0 ? value!.toLocaleString() : 'Unavailable';
const available = <T,>(feed?: Feed<T>) => !!feed && !feed.error && feed.data != null;
const complete = <T,>(feed?: Feed<T[]>) => available(feed) && Number.isSafeInteger(feed?.total) && feed!.total === feed!.data!.length;
const day = (value: string | null | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value ? value : null;
function Panel({ title, checkedAt, children }: { title: string; checkedAt?: string; children: ReactNode }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle><p className="text-xs text-muted-foreground">Checked {time(checkedAt)}</p></CardHeader><CardContent className="space-y-2 text-sm">{children}</CardContent></Card>;
}
function Unavailable() { return <p className="text-amber-800 dark:text-amber-200">Status unavailable. This check has not been connected or could not be read.</p>; }
function assignmentLabel(row: StateAssignment | undefined, full: boolean, today: string | null) {
  if (!row) return full ? 'Unassigned' : 'Assignment unknown';
  if (row.approved === false) return 'Awaiting approval';
  if (row.approved !== true) return 'Approval unknown';
  if (!today || !day(row.starts_on) || (row.ends_on !== null && !day(row.ends_on))) return 'Assignment dates need review';
  if (row.starts_on > today) return 'Approved · Starts later';
  if (row.ends_on && row.ends_on < today) return 'Assignment expired';
  return 'Assignment approval recorded';
}

export function AcquisitionReadiness({ data, compact = false }: { data: Snapshot; compact?: boolean }) {
  const controls = available(data.acquisitionControls) ? data.acquisitionControls!.data : null;
  const policy = available(data.acquisitionPolicy) && data.acquisitionPolicy!.data!.length === 1 ? data.acquisitionPolicy!.data![0] : null;
  const capacity = available(data.acquisitionCapacity) && data.acquisitionCapacity!.data!.length === 1 ? data.acquisitionCapacity!.data![0] : null;
  const checked = Date.parse(data.checkedAt);
  const today = Number.isFinite(checked) ? data.checkedAt.slice(0,10) : null;
  const assignments = available(data.acquisitionAssignments) ? data.acquisitionAssignments!.data! : [];
  const fullAssignments = complete(data.acquisitionAssignments);
  const codes = [...new Set([...Object.keys(states), ...assignments.map(row => row.state), ...(controls?.blocked_states ?? [])])].sort();
  const history = available(data.acquisitionHistory) ? data.acquisitionHistory!.data! : null;
  const inWindow = history?.filter(row => row.complete === true && Date.parse(row.reviewed_at) <= checked && checked < Date.parse(row.valid_until)).length;
  const capacityWindow = capacity && Number.isFinite(checked) && Date.parse(capacity.window_start) <= Date.parse(capacity.checked_at)
    && Date.parse(capacity.checked_at) <= checked && checked < Date.parse(capacity.window_end) && capacity.utc_day === today;
  return <section aria-label="Collection readiness" className="space-y-4">
    <div><h2 className="text-xl font-semibold">Collection readiness</h2><p className="mt-2 text-sm text-muted-foreground">Recorded operating checks for new requests. Each request still needs a current source, history, mailbox and capacity check before it can proceed.</p></div>
    <div className="rounded-xl border bg-muted/30 p-4 text-sm">
      <p className="font-medium">New request submissions: {controls?.atlas_live_enabled === false ? 'Disabled' : controls?.atlas_live_enabled === true ? 'Enabled in controls · Request checks still required' : 'Control unavailable'}</p>
      <p className="mt-2">Request lane: {controls?.foia_paused === true ? 'Paused' : controls?.foia_paused === false ? 'Not paused in controls' : 'Pause state unavailable'}</p>
      <p className="mt-2">Blocked states: {controls?.blocked_states == null ? 'Unavailable' : controls.blocked_states.length ? controls.blocked_states.map(code => states[code] ? `${states[code]} (${code})` : code).join(', ') : 'None recorded in the control'}</p>
      <p className="mt-3 text-xs text-muted-foreground">Incoming mailbox checks have their own status under News outlets. Receiving mail does not establish readiness to submit new requests.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Operating rules" checkedAt={data.acquisitionPolicy?.checkedAt}>
        {!available(data.acquisitionPolicy) ? <Unavailable /> : !policy ? <p>Operating policy missing or ambiguous.</p> : <>
          <p className="font-medium">{policy.approved === true ? 'Policy approval recorded' : policy.approved === false ? 'Policy awaiting approval' : 'Policy approval unknown'}</p>
          <p>Collection pause: {policy.global_paused === true ? 'On' : policy.global_paused === false ? 'Off in the policy' : 'Unknown'}</p>
        </>}
        <p className="text-xs text-muted-foreground">An approval flag alone does not verify a request's complete operating policy.</p>
      </Panel>
      <Panel title="Provider capacity" checkedAt={data.acquisitionCapacity?.checkedAt}>
        {!available(data.acquisitionCapacity) ? <Unavailable /> : !capacity ? <p>Provider capacity snapshot missing or ambiguous.</p> : <>
          <p className="font-medium">{capacityWindow ? 'Capacity snapshot recorded in its time window' : 'Capacity snapshot expired or out of date'}</p>
          <p>Recorded submission slots: {count(capacity.submission_slots_available)} · Recorded outbound messages: {count(capacity.outbound_messages_available)}</p>
          <p className="text-xs text-muted-foreground">Observed {time(capacity.checked_at)} · Window ends {time(capacity.window_end)}</p>
        </>}
        <p className="text-xs text-muted-foreground">These figures precede live request reservations. Provider reconciliation, mailbox limits and current usage are checked separately; no available-to-send total is inferred here.</p>
      </Panel>
      <Panel title="Shared agency history" checkedAt={data.acquisitionHistory?.checkedAt}>
        {!history ? <Unavailable /> : !history.length ? <p>{complete(data.acquisitionHistory) ? 'Agency history review missing.' : 'No history reviews are visible; coverage is unknown.'}</p> : <>
          <p>{count(history.length)} review records shown · {count(inWindow)} marked complete within their review window</p>
          <p className="text-xs text-muted-foreground">Latest recorded review: {time(history[0].reviewed_at)}</p>
        </>}
        <p className="text-xs text-muted-foreground">The current agency inventory and earlier requests across all outlets must match the review. This view does not read or certify that underlying history.</p>
        {history && !complete(data.acquisitionHistory) && <p className="text-xs text-muted-foreground">History list is incomplete. Missing reviews may be outside this view.</p>}
      </Panel>
      <Panel title="State coverage" checkedAt={data.acquisitionAssignments?.checkedAt}>
        {!available(data.acquisitionAssignments) ? <Unavailable /> : <>
          <p>{assignments.length ? `${count(assignments.length)} state assignment records shown` : fullAssignments ? 'No state assignments recorded.' : 'No assignments are visible; coverage is unknown.'}</p>
          <p className="text-xs text-muted-foreground">An outlet assignment needs its own approval and effective dates. Assignment does not override a blocked state or enable sending.</p>
        </>}
      </Panel>
    </div>
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-medium">State assignment coverage · Expand to view</summary>
      <p className="mt-3 text-xs text-muted-foreground">Reference list: 50 states and the District of Columbia, plus any other recorded codes. Listing a state does not select it for work.</p>
      {!fullAssignments && <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">The assignment list is unavailable or incomplete. Absent rows remain unknown.</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{codes.map(code => {
        const matches = assignments.filter(row => row.state === code);
        const row = matches.length === 1 ? matches[0] : undefined;
        const outlet = row && !data.outlets.error ? data.outlets.data?.find(item => item.id === row.outlet_id) : undefined;
        return <article key={code} className="rounded-lg border p-3"><p className="text-sm font-medium">{states[code] ?? code} ({code})</p>
          <p className="mt-1 text-xs">{matches.length > 1 ? 'Assignment needs review' : assignmentLabel(row, fullAssignments, today)}</p>
          {row && <p className="mt-1 break-words text-xs text-muted-foreground">{outlet?.name ?? 'Outlet details unavailable'}{outlet?.is_active === false ? ' · Outlet inactive' : ''}</p>}
          {controls?.blocked_states?.includes(code) && <Badge className="mt-2" variant="outline">Blocked by operations</Badge>}
        </article>;
      })}</div>
    </details>
    {!compact && <Panel title="Source, portal and outbound checks" checkedAt={data.acquisitionHealth?.checkedAt}>
      {!available(data.acquisitionHealth) ? <Unavailable /> : <div className="grid gap-3 sm:grid-cols-3">{[['source','Source access'],['portal','Portal access'],['outbound','Outbound email']].map(([kind,label]) => {
        const rows = data.acquisitionHealth!.data!.filter(row => row.kind === kind).sort((a,b) => Date.parse(b.checked_at)-Date.parse(a.checked_at));
        return <div key={kind} className="rounded-lg border p-3"><p className="font-medium">{label}</p>
          <p className="mt-2">{rows.length ? `${count(rows.length)} observations in view` : complete(data.acquisitionHealth) ? 'No check recorded' : 'No check visible; coverage unknown'}</p>
          {rows[0] && <p className="mt-2 text-xs text-muted-foreground">Latest: {rows[0].available === true ? 'Available at check' : rows[0].available === false ? 'Unavailable at check' : 'Result unknown'} · {time(rows[0].checked_at)}</p>}
        </div>;
      })}</div>}
      <p className="text-xs text-muted-foreground">These are recorded observations, not approval for a particular request. Exact source/account bindings and freshness are checked when the request is prepared.</p>
    </Panel>}
  </section>;
}

export function PublicDownloadStatus({ data }: { data: Snapshot }) {
  const feed = data.publicDownloadHealth;
  const labels: Record<string,string> = { staged:'Records staged for review',registered:'Collection registered',unchanged:'No change found at the last check',registration_replayed:'Previous registration confirmed',empty:'Check completed · No records found in the checked period',paused:'Collector paused',failed:'Collector check needed',held:'Run needs review',busy:'Another run was recorded in progress' };
  const pauseReasons: Record<string,string> = { harvester_paused:'The collector control is off.',control_missing:'The collector control is missing.',control_invalid:'The collector control needs review.' };
  return <Panel title="Public download collector · Syracuse" checkedAt={feed?.checkedAt}>
    {!available(feed) ? <Unavailable /> : !feed!.data!.length ? <p>No public-download run is recorded yet.</p> : feed!.data!.map(row => <div key={row.worker_name}>
      <p className="font-medium">{row.status === 'paused' ? labels.paused : row.last_error_code ? 'Collector check needed' : labels[row.status ?? ''] ?? 'Collector status needs verification'}</p>
      {row.status === 'paused' && <p className="mt-2">{pauseReasons[row.last_error_code ?? ''] ?? 'The pause reason needs review.'}</p>}
      <p className="mt-2">Last successful run: {time(row.last_success_at)}</p>
    </div>)}
    <p className="text-xs text-muted-foreground">Scope: download and stage public records for review. A recorded run does not establish a continuous schedule, customer acceptance or outgoing correspondence.</p>
  </Panel>;
}
