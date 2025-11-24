import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, AlertTriangle, XCircle, Loader2, FileSpreadsheet, Trash2, Eye, RefreshCw, Eraser } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { formatDistanceToNow } from "date-fns";
import { deleteUploadJob, reprocessUploadJob, cleanupDeletedJobs } from "@/services/uploadJobsAdmin";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_CONFIG = {
  QUEUED: { icon: Clock, bg: 'bg-gray-100', text: 'text-gray-700', label: 'Queued' },
  PARSING: { icon: Loader2, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Parsing', spin: true },
  PROCESSING: { icon: Loader2, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing', spin: true },
  DEDUPING: { icon: Loader2, bg: 'bg-purple-100', text: 'text-purple-700', label: 'Deduping', spin: true },
  FINALIZING: { icon: Loader2, bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Finalizing', spin: true },
  COMPLETE: { icon: CheckCircle2, bg: 'bg-green-100', text: 'text-green-700', label: 'Complete' },
  FAILED: { icon: XCircle, bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

export default function Jobs() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteJobId, setDeleteJobId] = React.useState<string | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['upload-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upload_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUploadJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-jobs'] });
      toast({
        title: 'Job Deleted',
        description: 'The upload job and all related data have been removed.',
      });
      setDeleteJobId(null);
    },
    onError: (error) => {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete job',
        variant: 'destructive',
      });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: reprocessUploadJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-jobs'] });
      toast({
        title: 'Job Reprocessing',
        description: 'The upload job has been queued for reprocessing.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Reprocess Failed',
        description: error instanceof Error ? error.message : 'Failed to reprocess job',
        variant: 'destructive',
      });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: cleanupDeletedJobs,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['upload-jobs'] });
      toast({
        title: 'Cleanup Complete',
        description: `Removed ${data.deleted} job(s) with deleted CSV files.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Cleanup Failed',
        description: error.message || 'Failed to cleanup jobs',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4 max-w-6xl">
          <h1 className="text-3xl font-bold mb-6">Upload Jobs</h1>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Upload Jobs (Internal)</h1>
            <p className="text-muted-foreground">
              Track internal CSV processing jobs. End users never see this — they only see processed properties on Leads.
            </p>
          </div>
          <Button
            onClick={() => cleanupMutation.mutate()}
            disabled={cleanupMutation.isPending}
            variant="outline"
          >
            <Eraser className="h-4 w-4 mr-2" />
            {cleanupMutation.isPending ? 'Cleaning...' : 'Cleanup Deleted CSVs'}
          </Button>
        </div>

        {jobs && jobs.length === 0 ? (
          <Card className="p-12 text-center">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No upload jobs yet</h3>
            <p className="text-muted-foreground mb-4">
              Start by uploading a CSV file with property data
            </p>
            <button
              onClick={() => navigate('/upload')}
              className="text-primary hover:underline"
            >
              Go to Upload
            </button>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs?.map((job) => {
              const config = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.QUEUED;
              const Icon = config.icon;
              const isProcessing = ['QUEUED', 'PARSING', 'PROCESSING', 'DEDUPING', 'FINALIZING'].includes(job.status);
              const progress = job.total_rows && job.processed_rows
                ? Math.round((job.processed_rows / job.total_rows) * 100)
                : 0;

              return (
                <Card
                  key={job.id}
                  className="p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{job.filename}</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${config.bg} ${config.text} border-0`}>
                        <Icon className={`h-3 w-3 mr-1 ${'spin' in config && config.spin ? 'animate-spin' : ''}`} />
                        {config.label}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => navigate(`/upload-jobs/${job.id}`)}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(job.status === 'COMPLETE' || job.status === 'FAILED') && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => reprocessMutation.mutate(job.id)}
                            disabled={reprocessMutation.isPending}
                            title="Reprocess"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteJobId(job.id)}
                          title="Delete Job"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {isProcessing && job.total_rows && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">File Size</p>
                      <p className="font-medium">{(job.file_size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    {job.total_rows && (
                      <div>
                        <p className="text-muted-foreground">Total Rows</p>
                        <p className="font-medium">{job.total_rows.toLocaleString()}</p>
                      </div>
                    )}
                    {job.status === 'COMPLETE' && (
                      <>
                        <div>
                          <p className="text-muted-foreground">Properties</p>
                          <p className="font-medium text-green-600">
                            {job.properties_created?.toLocaleString() ?? 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Violations</p>
                          <p className="font-medium text-blue-600">
                            {job.violations_created?.toLocaleString() ?? 0}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {job.status === 'FAILED' && job.error_message && (
                    <div className="mt-3 p-3 bg-destructive/10 rounded-lg">
                      <p className="text-sm text-destructive">{job.error_message}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <AlertDialog open={!!deleteJobId} onOpenChange={(open) => !open && setDeleteJobId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Upload Job</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the job record, all associated violations, and the CSV file from storage. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteJobId && deleteMutation.mutate(deleteJobId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
