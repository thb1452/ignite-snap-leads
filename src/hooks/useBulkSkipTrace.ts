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
    onSuccess: (data) => {
      const jobId = data.run_id;
      
      toast({
        title: "Skip trace started",
        description: `Processing ${data.total} properties...`,
      });

      // Start polling
      const pollInterval = setInterval(async () => {
        try {
          const job = await pollSkipTraceJob(jobId);
          
          if (job.finished_at) {
            clearInterval(pollInterval);
            
            toast({
              title: "Skip trace complete",
              description: `Found contacts for ${job.succeeded} properties`,
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
      }, 2500); // Poll every 2.5 seconds

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
