import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { backupSummary } from '@/services/owner/backup-status';
import type { Snapshot } from '@/services/owner/operations';

const count = (value: number | null) => value == null ? 'Unavailable' : value.toLocaleString();
const date = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const label = { verified: 'Verified within 24 hours', stale: 'Recheck due', pending: 'Pending verification', unavailable: 'Verification unavailable' };

export function PrivateBackupStatus({ data }: { data: Snapshot }) {
  const [now, setNow] = useState(Date.now);
  const summary = backupSummary(data, now);
  const nextExpiry = Math.min(...summary.rows.filter(row => row.state === 'verified' && row.verifiedAt)
    .map(row => Date.parse(row.verifiedAt!) + 24 * 60 * 60 * 1000 + 1));
  useEffect(() => {
    const updateAge = () => setNow(Date.now());
    const timer = window.setTimeout(updateAge, Math.max(1, Math.min(60_000, nextExpiry - Date.now())));
    window.addEventListener('focus', updateAge);
    document.addEventListener('visibilitychange', updateAge);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', updateAge);
      document.removeEventListener('visibilitychange', updateAge);
    };
  }, [now, nextExpiry]);
  return <Card><CardHeader><CardTitle className="text-lg">Private backups</CardTitle>
    <p className="text-sm text-muted-foreground">A private copy counts only after its saved plan and actual file verification reconcile. Each collection is counted once; these are not property or row counts.</p>
  </CardHeader><CardContent className="space-y-4">
    {!summary.reconciled && <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">{summary.complete ? 'Backup evidence needs review. Verification totals are unavailable.' : summary.available ? 'Backup list is incomplete. Totals are unavailable until the full evidence is in view.' : 'Backup evidence is unavailable. No successful backup is assumed.'}</p>}
    <div className="grid gap-4 sm:grid-cols-3">
      <div><p className="text-sm text-muted-foreground">Collections verified in 24 hours</p><p className="mt-1 text-2xl font-semibold">{count(summary.recent)}</p></div>
      <div><p className="text-sm text-muted-foreground">Awaiting verification</p><p className="mt-1 text-2xl font-semibold">{count(summary.pending)}</p></div>
      <div><p className="text-sm text-muted-foreground">Last actual file verification</p><p className="mt-1 text-sm font-medium">{summary.complete ? date(summary.lastVerifiedAt) : 'Unavailable'}</p></div>
    </div>
    {summary.complete && <p className="text-xs text-muted-foreground">{count(summary.stale)} collections need a newer check · {count(summary.uncertain)} need evidence review. This reflects the latest saved plan for each collection in the loaded register.</p>}
    {!summary.rows.length && summary.complete && <p className="text-sm text-muted-foreground">No source collections are registered for backup yet.</p>}
    {summary.rows.map(row => <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3" key={row.deliveryId}>
      <div><p className="text-sm font-medium">{row.sourceName}</p><p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>{row.verifiedAt && <p className="mt-1 text-xs text-muted-foreground">File check: {date(row.verifiedAt)}</p>}</div>
      <Badge variant="outline">{label[row.state]}</Badge>
    </div>)}
    <p className="text-xs text-muted-foreground">Refreshing this dashboard does not recheck file hashes. Customer acceptance and publication remain separate.</p>
  </CardContent></Card>;
}
import { useEffect, useState } from 'react';
