import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUpload {
  id: string;
  timestamp: string;
  fileName: string;
  uploadedBy: string;
  jurisdiction: string;
  totalRows: number;
  savedRows: number;
  status: string;
  processingTime: string;
  errorCount: number;
}

export function useAdminUploads(refreshTrigger?: Date) {
  return useQuery({
    queryKey: ["admin-uploads", refreshTrigger],
    queryFn: async (): Promise<AdminUpload[]> => {
      const { data, error } = await supabase
        .from("upload_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map((job) => {
        const startTime = job.started_at ? new Date(job.started_at) : null;
        const endTime = job.finished_at ? new Date(job.finished_at) : null;
        const processingTime = startTime && endTime 
          ? `${((endTime.getTime() - startTime.getTime()) / 1000).toFixed(1)}s`
          : "-";

        return {
          id: job.id,
          timestamp: job.created_at,
          fileName: job.filename,
          uploadedBy: "User", // TODO: Get from user_id join
          jurisdiction: `${job.city || "Unknown"}, ${job.state || ""}`,
          totalRows: job.total_rows || 0,
          savedRows: job.properties_created || 0,
          status: job.status || "UNKNOWN",
          processingTime,
          errorCount: (job.total_rows || 0) - (job.properties_created || 0),
        };
      });
    },
    refetchInterval: 30000,
  });
}
