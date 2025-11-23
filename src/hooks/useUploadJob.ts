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
}

export function useUploadJob(jobId: string | null) {
  const [job, setJob] = useState<UploadJob | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;

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

      setJob(data as UploadJob);
      setLoading(false);

      // Show completion notification
      if (data.status === 'COMPLETE') {
        toast({
          title: 'Upload Complete',
          description: `Created ${data.properties_created} properties and ${data.violations_created} violations`,
        });
      } else if (data.status === 'FAILED') {
        toast({
          title: 'Upload Failed',
          description: data.error_message || 'An error occurred',
          variant: 'destructive',
        });
      }

      return data;
    };

    fetchJob();

    // Poll for updates every 1 second while job is active
    pollInterval = setInterval(async () => {
      const data = await fetchJob();
      if (data && (data.status === 'COMPLETE' || data.status === 'FAILED')) {
        if (pollInterval) clearInterval(pollInterval);
      }
    }, 1000);

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
  }, [jobId, toast]);

  return { job, loading };
}
