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
      if (!data?.ok) {
        toast({
          title: "Skip trace failed",
          description: data?.error || "Failed to start skip trace",
          variant: "destructive",
        });
        return;
      }

      const jobId = data.job_id;
      const total = data.total || 0;
      const idempotent = data.idempotency;
      
      toast({
        title: idempotent ? "Skip trace already running" : "Skip trace started",
        description: `Processing ${total} properties...`,
      });

      // Start polling
      const pollInterval = setInterval(async () => {
        try {
          const job = await pollSkipTraceJob(jobId);
          
          if (job.finished_at || job.status === "completed") {
            clearInterval(pollInterval);
            
            const succeeded = job.counts?.succeeded || 0;
            const failed = job.counts?.failed || 0;
            const refunded = failed;
            
            const description = refunded > 0
              ? `Found contacts for ${succeeded} properties. ${refunded} credits refunded.`
              : `Found contacts for ${succeeded} properties`;
            
            toast({
              title: "Skip trace complete",
              description,
            });

            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ["properties"] });
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            queryClient.invalidateQueries({ queryKey: ["property-contacts"] });
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
      let message = error.message || "Failed to start skip trace";
      
      if (error.message?.includes("INSUFFICIENT_CREDITS")) {
        message = "Insufficient credits. Please add more credits to continue.";
      } else if (error.message?.includes("active jobs")) {
        message = error.message;
      }
      
      toast({
        title: "Skip trace failed",
        description: message,
        variant: "destructive",
      });
    },
  });
}
