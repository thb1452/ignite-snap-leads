import { UploadJob } from '@/hooks/useUploadJob';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, XCircle, Upload, RefreshCw } from 'lucide-react';

interface UploadProgressProps {
  job: UploadJob;
  onReset?: () => void;
  onRefresh?: () => void;
}

export function UploadProgress({ job, onReset, onRefresh }: UploadProgressProps) {
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
  const showRowCounts = job.status === 'PROCESSING' && total > 0;
  const showProgress = !['COMPLETE', 'FAILED'].includes(job.status);
  const isFinished = job.status === 'COMPLETE' || job.status === 'FAILED';

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
              
              {showRowCounts && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{done.toLocaleString()} / {total.toLocaleString()} rows</span>
                  <span>{pct}%</span>
                </div>
              )}
              
              {job.status === 'PARSING' && (
                <p className="text-xs text-muted-foreground">
                  {total > 0 ? `Found ${total.toLocaleString()} rows, staging...` : 'Counting rows...'}
                </p>
              )}
              
              {job.status === 'DEDUPING' && (
                <p className="text-xs text-muted-foreground">
                  Creating properties from {total.toLocaleString()} rows... 
                  {job.properties_created ? ` (${job.properties_created.toLocaleString()} created)` : ''}
                </p>
              )}
              
              {job.status === 'CREATING_VIOLATIONS' && (
                <p className="text-xs text-muted-foreground">
                  Creating violation records... 
                  {job.violations_created ? `(${job.violations_created.toLocaleString()} created)` : ''}
                </p>
              )}
              
              {job.status === 'FINALIZING' && (
                <p className="text-xs text-muted-foreground">Running insights and geocoding...</p>
              )}
              
              {/* Show refresh button if job seems stuck (violations_created matches total but still not complete) */}
              {job.status === 'CREATING_VIOLATIONS' && job.violations_created && job.total_rows && 
               job.violations_created >= job.total_rows && onRefresh && (
                <Button onClick={onRefresh} variant="ghost" size="sm" className="mt-2">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh Status
                </Button>
              )}
            </>
          )}

          {job.status === 'COMPLETE' && (
            <div className="space-y-3">
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
              {onReset && (
                <Button onClick={onReset} variant="outline" size="sm" className="w-full">
                  <Upload className="w-4 h-4 mr-2" />
                  Start New Upload
                </Button>
              )}
            </div>
          )}

          {job.status === 'FAILED' && (
            <div className="space-y-3">
              {job.error_message && (
                <p className="text-sm text-destructive">{job.error_message}</p>
              )}
              {onReset && (
                <Button onClick={onReset} variant="outline" size="sm" className="w-full">
                  <Upload className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
