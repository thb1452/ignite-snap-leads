import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GeocodingJob {
  id: string;
  user_id: string;
  status: string;
  total_properties: number;
  geocoded_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export function useGeocodingJob(jobId: string | null) {
  const [job, setJob] = useState<GeocodingJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }

    // Fetch initial job state
    const fetchJob = async () => {
      const { data, error } = await supabase
        .from("geocoding_jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error) {
        console.error("Error fetching job:", error);
        setLoading(false);
        return;
      }

      setJob(data);
      setLoading(false);
    };

    fetchJob();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`geocoding-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "geocoding_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setJob(payload.new as GeocodingJob);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, loading };
}