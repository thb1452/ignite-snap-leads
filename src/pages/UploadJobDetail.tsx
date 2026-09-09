import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileSpreadsheet, MapPin, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { UploadRowsReview } from '@/components/uploads/UploadRowsReview';

const STATUS_CONFIG = {
  QUEUED: { icon: Clock, bg: 'bg-gray-100', text: 'text-gray-700', label: 'Queued' },
  PARSING: { icon: Clock, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Parsing' },
  PROCESSING: { icon: Clock, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  DEDUPING: { icon: Clock, bg: 'bg-purple-100', text: 'text-purple-700', label: 'Deduping' },
  FINALIZING: { icon: Clock, bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Finalizing' },
  COMPLETE: { icon: CheckCircle2, bg: 'bg-green-100', text: 'text-green-700', label: 'Complete' },
  FAILED: { icon: XCircle, bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

export default function UploadJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const { data: job, isLoading, isError: jobError, refetch } = useQuery({
    queryKey: ['upload-job', user?.id, id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('upload_jobs')
        .select('*')
        .eq('id', id)
        .abortSignal(signal).single();

      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user && !authLoading,
    gcTime: 0,
    retry: false,
  });

  if (authLoading || (user && isLoading)) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4 max-w-6xl">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return <AppLayout><div className="container mx-auto py-8 px-4 max-w-6xl">
      <p>Sign in to review your upload rows.</p>
      <Button onClick={() => navigate('/auth?mode=signin')}>Sign in</Button>
    </div></AppLayout>;
  }

  if (jobError) {
    return <AppLayout><div className="container mx-auto py-8 px-4 max-w-6xl" role="alert">
      <p>This upload job could not be loaded for your account.</p>
      <Button variant="outline" onClick={() => void refetch()}>Retry job</Button>
    </div></AppLayout>;
  }

  if (!job) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4 max-w-6xl">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Job Not Found</h2>
            <p className="text-muted-foreground mb-4">The upload job you're looking for doesn't exist.</p>
            <Button onClick={() => navigate('/jobs')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const config = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.QUEUED;
  const Icon = config.icon;

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/jobs')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Jobs
          </Button>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{job.filename}</h1>
              <p className="text-muted-foreground">
                Uploaded {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
              </p>
            </div>
            <Badge className={`${config.bg} ${config.text} border-0`}>
              <Icon className="h-4 w-4 mr-1" />
              {config.label}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{job.city}, {job.state}</p>
                  <p className="text-sm text-muted-foreground">{job.county} County</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">File Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Size:</span> {(job.file_size / 1024 / 1024).toFixed(2)} MB
                </p>
                {job.total_rows && (
                  <p className="text-sm">
                    <span className="font-medium">Rows:</span> {job.total_rows.toLocaleString()}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Results</CardTitle>
            </CardHeader>
            <CardContent>
              {job.status === 'COMPLETE' ? (
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="font-medium text-green-600">Properties:</span> {job.properties_created?.toLocaleString() || 0}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium text-blue-600">Violations:</span> {job.violations_created?.toLocaleString() || 0}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Processing...</p>
              )}
            </CardContent>
          </Card>
        </div>

        {job.status === 'FAILED' && job.error_message && (
          <Card className="mb-6 border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Error Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-destructive">{job.error_message}</p>
            </CardContent>
          </Card>
        )}

        {job.warnings && Array.isArray(job.warnings) && job.warnings.length > 0 && (
          <Card className="mb-6 border-warning">
            <CardHeader>
              <CardTitle className="text-warning flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Warnings ({job.warnings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {job.warnings.map((warning: unknown, i: number) => (
                  <li key={i} className="text-warning">• {typeof warning === 'string' ? warning : JSON.stringify(warning)}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <UploadRowsReview key={`${user.id}:${job.id}`} jobId={job.id} viewerId={user.id} />
      </div>
    </AppLayout>
  );
}
