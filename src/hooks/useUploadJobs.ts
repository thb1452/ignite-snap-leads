import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UploadJob {
  id: string;
  status: 'QUEUED' | 'PARSING' | 'PROCESSING' | 'DEDUPING' | 'FINALIZING' | 'COMPLETE' | 'FAILED';
  total_rows: number | null;
  processed_rows: number | null;
  properties_created: number | null;
  violations_created: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  city: string | null;
  state: string | null;
}

export interface CombinedJobStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalRows: number;
  processedRows: number;
  propertiesCreated: number;
  violationsCreated: number;
  isComplete: boolean;
  isFailed: boolean;
  isProcessing: boolean;
  jobs: UploadJob[];
}

/**
 * Hook to track multiple upload jobs created from a multi-city CSV split.
 * Returns combined statistics across all jobs.
 */
export function useUploadJobs(jobIds: string[]) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!jobIds || jobIds.length === 0) {
      setLoading(false);
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;
    let hasShownComplete = false;

    const fetchJobs = async () => {
      const { data, error } = await supabase
        .from('upload_jobs')
        .select('*')
        .in('id', jobIds);

      if (error) {
        console.error('Error fetching jobs:', error);
        setLoading(false);
        return null;
      }

      setJobs(data as UploadJob[]);
      setLoading(false);
      return data;
    };

    fetchJobs();

    // Poll for updates
    pollInterval = setInterval(async () => {
      const data = await fetchJobs();
      if (data) {
        const allDone = data.every(j => j.status === 'COMPLETE' || j.status === 'FAILED');
        if (allDone && !hasShownComplete) {
          hasShownComplete = true;
          if (pollInterval) clearInterval(pollInterval);
          
          const totalProps = data.reduce((sum, j) => sum + (j.properties_created || 0), 0);
          const totalViols = data.reduce((sum, j) => sum + (j.violations_created || 0), 0);
          const failed = data.filter(j => j.status === 'FAILED').length;
          
          if (failed > 0) {
            toast({
              title: 'Upload Partially Failed',
              description: `${data.length - failed}/${data.length} jobs completed. ${totalProps} properties, ${totalViols} violations created.`,
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'All Uploads Complete',
              description: `${data.length} jobs processed. ${totalProps} properties, ${totalViols} violations created.`,
            });
          }
        }
      }
    }, 1000);

    // Subscribe to realtime updates for all jobs
    const channels = jobIds.map(jobId => 
      supabase
        .channel(`upload_job_${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'upload_jobs',
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            setJobs(prev => 
              prev.map(j => j.id === jobId ? (payload.new as UploadJob) : j)
            );
          }
        )
        .subscribe()
    );

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [jobIds.join(','), toast]);

  // Calculate combined stats
  const stats: CombinedJobStats = {
    totalJobs: jobs.length,
    completedJobs: jobs.filter(j => j.status === 'COMPLETE').length,
    failedJobs: jobs.filter(j => j.status === 'FAILED').length,
    totalRows: jobs.reduce((sum, j) => sum + (j.total_rows || 0), 0),
    processedRows: jobs.reduce((sum, j) => sum + (j.processed_rows || 0), 0),
    propertiesCreated: jobs.reduce((sum, j) => sum + (j.properties_created || 0), 0),
    violationsCreated: jobs.reduce((sum, j) => sum + (j.violations_created || 0), 0),
    isComplete: jobs.length > 0 && jobs.every(j => j.status === 'COMPLETE'),
    isFailed: jobs.some(j => j.status === 'FAILED'),
    isProcessing: jobs.some(j => !['COMPLETE', 'FAILED'].includes(j.status)),
    jobs,
  };

  return { stats, loading };
}
