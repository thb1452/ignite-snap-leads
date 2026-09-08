import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { archiveJobSummary } from '@/services/owner/archive-job-status';
import type { Snapshot } from '@/services/owner/operations';

const date = (v: string | null | undefined) => v && Number.isFinite(Date.parse(v))
  ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unavailable';

export function ArchiveJobs({ data }: { data: Snapshot }) {
  const [now, setNow] = useState(Date.now);
  const summary = archiveJobSummary(data, now);
  const nextChange = Math.min(...summary.rows.map(row => row.nextChange ?? Infinity));
  useEffect(() => {
    const updateAge = () => setNow(Date.now());
    const timer = window.setTimeout(updateAge, Math.max(1, Math.min(60_000, nextChange - Date.now())));
    window.addEventListener('focus', updateAge);
    document.addEventListener('visibilitychange', updateAge);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', updateAge); document.removeEventListener('visibilitychange', updateAge); };
  }, [now, nextChange]);
  return <Card><CardHeader><CardTitle className="text-lg">Recent backup jobs</CardTitle>
    <p className="text-sm text-muted-foreground">Automatic Syracuse backups only. Jobs, attempts and copies do not add source collections or approve customer records.</p>
    <p className="text-xs text-muted-foreground">{summary.available ? `Showing ${summary.rows.length} recent jobs${summary.total === null ? '; total unavailable' : ` from ${summary.total} recorded jobs`}` : 'Job feed unavailable'} · Checked {date(data.archiveJobs?.checkedAt)}</p>
  </CardHeader><CardContent className="space-y-4">
    <div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="font-medium">{summary.enabled === false ? 'Automatic backup paused' : summary.enabled === true ? 'Automatic backup permitted' : 'Backup control unavailable'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{summary.enabled === null ? 'The dedicated backup control is missing, invalid or unavailable. No enabled state is assumed.' : 'This recorded control does not confirm that a worker or timer is running. Collection and incoming mail have separate controls.'}</p></div>
    {!summary.available ? <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">Backup jobs are unavailable. Missing jobs are not counted as zero.</p>
      : <>{!summary.complete && <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">This is an incomplete recent-job view. Jobs outside it are not assumed absent, and no total waiting-work count is inferred.</p>}
        {!summary.rows.length && <p className="text-sm text-muted-foreground">{summary.complete ? 'No automatic backup jobs are recorded. Earlier or manual backups may have separate verification evidence above.' : 'No job rows are available in this partial view.'}</p>}
        {summary.rows.map(row => <article className="space-y-2 rounded-lg border p-3" key={row.id}>
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-medium">{row.sourceName}</p><Badge variant="outline">{row.label}</Badge></div>
          {row.attempt !== null && <p className="text-xs text-muted-foreground">Attempts used: {row.attempt} of 4 · Job updated {date(row.updatedAt)}</p>}
          {row.scheduledAt && <p className="text-xs text-muted-foreground">Retry time: {date(row.scheduledAt)}</p>}
          {row.leaseExpiresAt && <p className="text-xs text-muted-foreground">Attempt reservation expires: {date(row.leaseExpiresAt)}</p>}
          {row.verifiedAt && <p className="text-xs text-muted-foreground">Actual file check: {date(row.verifiedAt)}</p>}
          {row.errorReason && <p className="text-sm">{row.errorReason}</p>}
          {row.proofNote && <p className="text-xs text-muted-foreground">{row.proofNote}</p>}
          <p className="text-sm">Next action: {row.nextAction}</p>
        </article>)}</>}
    <p className="text-xs text-muted-foreground">A finished job does not renew an old file check. Verified backups, source counts and customer acceptance remain in their separate registers.</p>
  </CardContent></Card>;
}
