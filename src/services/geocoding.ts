import { supabase } from "@/integrations/supabase/client";
import { callFn } from "@/integrations/http/functions";

export type GeocodingJobStatus = "queued" | "running" | "completed" | "failed";

export interface GeocodingJob {
  id: string;
  user_id: string;
  status: GeocodingJobStatus;
  total_properties: number;
  geocoded_count: number;
  failed_count: number;
  error_message?: string | null;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

/**
 * Start a geocoding job for the current user.
 * - Counts properties missing lat/lng
 * - Creates a geocoding_jobs row
 * - Kicks off background batching via processGeocodingBatches
 * - Returns jobId immediately for the UI
 */
export async function startGeocodingJob(): Promise<string> {
  try {
    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("Not authenticated");

    // Count properties that still need geocoding
    const { count, error: countError } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .or("latitude.is.null,longitude.is.null");

    if (countError) throw countError;

    if (!count || count === 0) {
      throw new Error("No properties need geocoding");
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from("geocoding_jobs")
      .insert({
        user_id: user.id,
        status: "queued",
        total_properties: count,
        geocoded_count: 0,
        failed_count: 0,
        started_at: null,
        finished_at: null,
        error_message: null,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw jobError || new Error("Failed to create geocoding job");
    }

    // ✅ Fire-and-forget: backend handles batching, UI doesn't wait
    processGeocodingBatches(job.id).catch((error) => {
      console.error("[Geocoding] Failed to process geocoding batches:", error);
    });

    return job.id;
  } catch (error) {
    console.error("[Geocoding] Error starting geocoding job:", error);
    throw error;
  }
}

/**
 * Runs the geocode-properties edge function in batches until there are no
 * remaining properties. This runs entirely in the background.
 */
async function processGeocodingBatches(jobId: string) {
  try {
    // Mark job as running (if still queued)
    await supabase
      .from("geocoding_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", jobId)
      .in("status", ["queued", "running"]);

    while (true) {
      // One batch of work
      const result = await callFn("geocode-properties", {
        jobId,
      }) as { remaining: number };

      if (
        !result ||
        typeof result.remaining !== "number" ||
        Number.isNaN(result.remaining)
      ) {
        console.warn("[Geocoding] Unexpected geocode-properties result:", result);
        break;
      }

      if (result.remaining <= 0) {
        console.log("[Geocoding] Geocoding complete for job", jobId);

        await supabase
          .from("geocoding_jobs")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        break;
      }

      // Small delay to avoid hammering the provider / hitting rate limits
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Geocoding] Error processing geocoding batches:", error);

    await supabase
      .from("geocoding_jobs")
      .update({
        status: "failed",
        error_message:
          error instanceof Error ? error.message : "Unknown error",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

/**
 * Helper for the UI to fetch a specific job by ID
 */
export async function getGeocodingJob(jobId: string): Promise<GeocodingJob | null> {
  const { data, error } = await supabase
    .from("geocoding_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data as GeocodingJob;
}

/**
 * Helper for the UI to fetch the most recent job for the current user.
 */
export async function fetchLatestGeocodingJob(): Promise<GeocodingJob | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("geocoding_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as GeocodingJob | null;
}
