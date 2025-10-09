import { Job } from "@/services/jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface JobProgressProps {
  job: Job;
}

export function JobProgress({ job }: JobProgressProps) {
  const done = (job.counts?.succeeded ?? 0) + (job.counts?.failed ?? 0);
  const total = job.counts?.total ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  
  // Calculate ETA if still processing
  let eta: string | null = null;
  if (job.status === 'processing' && job.started_at && done > 0) {
    const elapsedMs = Date.now() - new Date(job.started_at).getTime();
    const msPerProperty = elapsedMs / done;
    const remaining = total - done;
    const estimatedMs = msPerProperty * remaining;
    const minutes = Math.ceil(estimatedMs / 60000);
    eta = minutes > 1 ? `~${minutes}m left` : '~1m left';
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-2xl font-bold">
            <span>{done}</span>
            <span className="text-muted-foreground">/ {total}</span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{pct}% complete</span>
            {eta && <span className="text-primary font-medium">{eta}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
