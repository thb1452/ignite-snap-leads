import { useEffect, useState, useRef } from "react";
import { fetchLatestGeocodingJob, GeocodingJob } from "@/services/geocoding";

const TIMEOUT_MS = 8000; // 8 second timeout

export function useGeocodingJob(pollMs: number = 5000) {
  const [job, setJob] = useState<GeocodingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let mounted = true;

    async function load() {
      // Cancel previous request if still pending
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();
      
      const timeoutId = setTimeout(() => {
        if (abortRef.current) {
          abortRef.current.abort();
        }
      }, TIMEOUT_MS);

      try {
        setLoading(true);
        const latest = await fetchLatestGeocodingJob();
        
        clearTimeout(timeoutId);
        if (!mounted) return;
        
        setJob(latest ?? null);
        setError(null);
        setTimedOut(false);

        const active =
          latest &&
          (latest.status === "queued" || latest.status === "running");

        if (active) {
          // keep polling but with longer interval
          timer = window.setTimeout(load, pollMs);
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (!mounted) return;
        
        console.error("[Geocoding] Failed to fetch latest job", err);
        
        // Check for timeout/abort
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
          setTimedOut(true);
          setError(null); // Don't show error for timeout, just hide the component
        } else {
          setError(
            err instanceof Error ? err.message : "Failed to load geocoding job",
          );
        }
        setJob(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
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

  return { job, loading, error, progress, timedOut };
}
