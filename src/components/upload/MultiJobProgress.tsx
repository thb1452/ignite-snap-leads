import { CombinedJobStats } from '@/hooks/useUploadJobs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Loader2, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface MultiJobProgressProps {
  stats: CombinedJobStats;
}

export function MultiJobProgress({ stats }: MultiJobProgressProps) {
  const pct = stats.totalRows > 0 
    ? Math.round((stats.processedRows / stats.totalRows) * 100) 
    : 0;

  const statusIcon = () => {
    if (stats.isComplete) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (stats.isFailed && !stats.isProcessing) {
      return <XCircle className="h-5 w-5 text-destructive" />;
    }
    if (stats.isFailed && stats.isProcessing) {
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
    return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  };

  const statusMessage = () => {
    if (stats.isComplete) return 'All uploads complete!';
    if (stats.isFailed && !stats.isProcessing) return 'Some uploads failed';
    if (stats.isProcessing) return `Processing ${stats.totalJobs} jobs...`;
    return 'Starting...';
  };

  const statusLabel = () => {
    if (stats.isComplete) return 'COMPLETE';
    if (stats.isFailed && !stats.isProcessing) return 'PARTIAL';
    return 'PROCESSING';
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
            <span className="text-muted-foreground">{statusMessage()}</span>
            <span className="font-medium">{statusLabel()}</span>
          </div>

          {stats.totalJobs > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              {stats.jobs.map((job) => (
                <Badge 
                  key={job.id} 
                  variant={
                    job.status === 'COMPLETE' ? 'default' : 
                    job.status === 'FAILED' ? 'destructive' : 
                    'secondary'
                  }
                  className="text-xs"
                >
                  {job.city}, {job.state}: {job.status === 'COMPLETE' ? '✓' : job.status === 'FAILED' ? '✗' : '...'}
                </Badge>
              ))}
            </div>
          )}

          {stats.totalRows > 0 && stats.isProcessing && (
            <>
              <Progress value={pct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{stats.completedJobs} / {stats.totalJobs} jobs complete</span>
                <span>{pct}%</span>
              </div>
            </>
          )}

          {(stats.isComplete || (stats.isFailed && !stats.isProcessing)) && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jobs Completed:</span>
                <span className="font-medium">{stats.completedJobs} / {stats.totalJobs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Properties Created:</span>
                <span className="font-medium">{stats.propertiesCreated.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Violations Created:</span>
                <span className="font-medium">{stats.violationsCreated.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
