import { UploadJob } from '@/hooks/useUploadJob';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface UploadProgressProps {
  job: UploadJob;
}

export function UploadProgress({ job }: UploadProgressProps) {
  const done = job.processed_rows ?? 0;
  const total = job.total_rows ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  
  const statusMessages: Record<string, string> = {
    QUEUED: 'Waiting to start...',
    PARSING: 'Reading CSV file...',
    PROCESSING: 'Staging rows...',
    DEDUPING: 'Creating properties...',
    CREATING_VIOLATIONS: 'Creating violations...',
    FINALIZING: 'Finalizing...',
    COMPLETE: 'Upload complete!',
    FAILED: 'Upload failed',
  };

  const statusIcon = () => {
    if (job.status === 'COMPLETE') {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (job.status === 'FAILED') {
      return <XCircle className="h-5 w-5 text-destructive" />;
    }
    return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Upload Progress</CardTitle>
          {statusIcon()}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{statusMessages[job.status]}</span>
            <span className="font-medium">{job.status}</span>
          </div>

          {total > 0 && job.status !== 'COMPLETE' && job.status !== 'FAILED' && (
            <>
              <Progress value={pct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{done.toLocaleString()} / {total.toLocaleString()} rows</span>
                <span>{pct}%</span>
              </div>
            </>
          )}

          {job.status === 'COMPLETE' && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Properties Created:</span>
                <span className="font-medium">{job.properties_created?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Violations Created:</span>
                <span className="font-medium">{job.violations_created?.toLocaleString()}</span>
              </div>
            </div>
          )}

          {job.status === 'FAILED' && job.error_message && (
            <p className="text-sm text-destructive">{job.error_message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
