import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UploadJob {
  id: string;
  status: 'QUEUED' | 'PARSING' | 'PROCESSING' | 'DEDUPING' | 'CREATING_VIOLATIONS' | 'FINALIZING' | 'COMPLETE' | 'FAILED';
  total_rows: number | null;
  processed_rows: number | null;
  properties_created: number | null;
  violations_created: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export function useUploadJob(jobId: string | null) {
  const [job, setJob] = useState<UploadJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();
  
  const refresh = () => setRefreshTrigger(prev => prev + 1);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;
    let retryAttempted = false;

    // Check if job is stuck and needs auto-retry
    const checkAndRetryStuckJob = async (jobData: UploadJob) => {
      if (retryAttempted) return;
      
      const stuckStatuses = ['PARSING', 'PROCESSING', 'DEDUPING', 'CREATING_VIOLATIONS', 'FINALIZING'];
      if (!stuckStatuses.includes(jobData.status)) return;
      
      // If job has been in a processing state for more than 3 minutes, auto-retry
      const startedAt = jobData.started_at ? new Date(jobData.started_at).getTime() : 0;
      const stuckThreshold = 3 * 60 * 1000; // 3 minutes
      
      if (startedAt && Date.now() - startedAt > stuckThreshold) {
        retryAttempted = true;
        console.log('[useUploadJob] Job appears stuck, triggering auto-retry...');
        
        try {
          // Call job monitor to reset stuck jobs
          await supabase.functions.invoke('job-monitor', {});
          toast({
            title: 'Retrying Upload',
            description: 'Job appeared stuck, automatically restarting...',
          });
        } catch (e) {
          console.error('[useUploadJob] Auto-retry failed:', e);
        }
      }
    };

    // Fetch initial job state
    const fetchJob = async () => {
      const { data, error } = await supabase
        .from('upload_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) {
        console.error('Error fetching job:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch job status',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      console.log('[useUploadJob] Fetched job:', data.id, 'Status:', data.status);
      
      // Only update state if status actually changed or we don't have job data yet
      setJob(prev => {
        if (!prev || prev.status !== data.status || prev.violations_created !== data.violations_created) {
          return data as UploadJob;
        }
        return prev;
      });
      setLoading(false);

      // Check if stuck and auto-retry
      await checkAndRetryStuckJob(data as UploadJob);

      // Show completion notification only on status change to COMPLETE
      if (data.status === 'COMPLETE') {
        console.log('[useUploadJob] Job completed!', data.id);
      } else if (data.status === 'FAILED') {
        console.log('[useUploadJob] Job failed!', data.id, data.error_message);
      }

      return data;
    };

    fetchJob();

    // Poll for updates every 500ms while job is active (faster for better UX)
    pollInterval = setInterval(async () => {
      const data = await fetchJob();
      if (data && (data.status === 'COMPLETE' || data.status === 'FAILED')) {
        if (pollInterval) clearInterval(pollInterval);
      }
    }, 500);

    // Subscribe to realtime updates as backup
    const channel = supabase
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
          console.log('Job update (realtime):', payload);
          setJob(payload.new as UploadJob);

          // Show completion notification
          if (payload.new.status === 'COMPLETE') {
            if (pollInterval) clearInterval(pollInterval);
            toast({
              title: 'Upload Complete',
              description: `Created ${payload.new.properties_created} properties and ${payload.new.violations_created} violations`,
            });
          } else if (payload.new.status === 'FAILED') {
            if (pollInterval) clearInterval(pollInterval);
            toast({
              title: 'Upload Failed',
              description: payload.new.error_message || 'An error occurred',
              variant: 'destructive',
            });
          }
        }
      )
      .subscribe();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [jobId, toast, refreshTrigger]);

  return { job, loading, refresh };
}
