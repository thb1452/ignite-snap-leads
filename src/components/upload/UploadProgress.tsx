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
    PARSING: 'Reading and parsing CSV file...',
    PROCESSING: 'Staging rows in database...',
    DEDUPING: 'Creating properties (deduplicating)...',
    CREATING_VIOLATIONS: 'Creating violations...',
    FINALIZING: 'Finalizing and generating insights...',
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

  // Show indeterminate progress for stages where we don't have row counts
  const isIndeterminateStage = ['QUEUED', 'PARSING', 'DEDUPING', 'CREATING_VIOLATIONS', 'FINALIZING'].includes(job.status);
  const showProgress = !['COMPLETE', 'FAILED'].includes(job.status);

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
            <span className="text-muted-foreground">{statusMessages[job.status] || job.status}</span>
            <span className="font-medium">{job.status}</span>
          </div>

          {showProgress && (
            <>
              {isIndeterminateStage ? (
                // Animated indeterminate progress bar
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-primary rounded-full animate-pulse" 
                       style={{ animation: 'indeterminate 1.5s ease-in-out infinite' }} />
                </div>
              ) : (
                <Progress value={pct} className="h-2" />
              )}
              
              {total > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{done.toLocaleString()} / {total.toLocaleString()} rows</span>
                  <span>{isIndeterminateStage ? 'Processing...' : `${pct}%`}</span>
                </div>
              )}
              
              {total === 0 && job.status === 'PARSING' && (
                <p className="text-xs text-muted-foreground">Counting rows...</p>
              )}
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
