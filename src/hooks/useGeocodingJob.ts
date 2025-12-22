import { useEffect, useState } from "react";
import { fetchLatestGeocodingJob, GeocodingJob } from "@/services/geocoding";

export function useGeocodingJob(pollMs: number = 2000) {
  const [job, setJob] = useState<GeocodingJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;

    async function load() {
      try {
        setLoading(true);
        const latest = await fetchLatestGeocodingJob();
        setJob(latest ?? null);
        setError(null);

        const active =
          latest &&
          (latest.status === "queued" || latest.status === "running");

        if (active) {
          // keep polling
          timer = window.setTimeout(load, pollMs);
        }
      } catch (err) {
        console.error("[Geocoding] Failed to fetch latest job", err);
        setError(
          err instanceof Error ? err.message : "Failed to load geocoding job",
        );
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [pollMs]);

  // FIX: Include skipped_count in progress calculation
  // Progress = (successfully geocoded + intentionally skipped) / total
  const progress =
    job && job.total_properties > 0
      ? Math.min(
          100,
          Math.round(((job.geocoded_count + (job.skipped_count || 0)) / job.total_properties) * 100),
        )
      : 0;

  return { job, loading, error, progress };
}
