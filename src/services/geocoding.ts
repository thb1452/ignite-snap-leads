import { supabase } from "@/integrations/supabase/client";
import { callFn } from "@/integrations/http/functions";

export async function startGeocodingJob(): Promise<string> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Count properties that need geocoding
    const { count } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .or("latitude.is.null,longitude.is.null");

    if (!count || count === 0) {
      throw new Error("No properties need geocoding");
    }

    // Create job record
    const { data: job, error } = await supabase
      .from("geocoding_jobs")
      .insert({
        user_id: user.id,
        status: "queued",
        total_properties: count,
        geocoded_count: 0,
        failed_count: 0,
      })
      .select("id")
      .single();

    if (error) throw error;

    // Trigger background processing (fire and forget)
    callFn("geocode-properties", { jobId: job.id }).catch(error => {
      console.error("Failed to trigger geocoding:", error);
    });

    return job.id;
  } catch (error) {
    console.error("Error starting geocoding job:", error);
    throw error;
  }
}

export async function getGeocodingJob(jobId: string) {
  const { data, error } = await supabase
    .from("geocoding_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data;
}