import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBulkSkipTraceJob, pollSkipTraceJob } from "@/services/skiptraceJobs";
import { useToast } from "@/hooks/use-toast";

export function useBulkSkipTrace() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (propertyIds: string[]) => {
      const result = await createBulkSkipTraceJob(propertyIds);
      return result;
    },
    onSuccess: (data: any) => {
      const jobId = data.job_id;
      const total = data.total || 0;
      const isExisting = data.existing || false;
      
      if (isExisting) {
        toast({
          title: "Job already running",
          description: `This skip trace is already in progress`,
        });
        return;
      }

      toast({
        title: "Skip trace started",
        description: `Processing ${total} properties...`,
      });

      // Start polling
      const pollInterval = setInterval(async () => {
        try {
          const job = await pollSkipTraceJob(jobId);
          
          if (job.finished_at) {
            clearInterval(pollInterval);
            
            const succeeded = job.counts?.succeeded || 0;
            const failed = job.counts?.failed || 0;
            const description = failed > 0
              ? `Found contacts for ${succeeded} properties. ${failed} credits refunded.`
              : `Found contacts for ${succeeded} properties`;
            
            toast({
              title: "Skip trace complete",
              description,
            });

            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ["properties"] });
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            queryClient.invalidateQueries({ queryKey: ["credits"] });
          }
        } catch (error) {
          clearInterval(pollInterval);
          console.error("Error polling job:", error);
        }
      }, 2500);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(pollInterval), 300000);
    },
    onError: (error: any) => {
      toast({
        title: "Skip trace failed",
        description: error.message || "Failed to start skip trace",
        variant: "destructive",
      });
    },
  });
}
