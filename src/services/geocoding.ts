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

    // Start the geocoding process (it will run in batches)
    processGeocodingBatches(job.id).catch(error => {
      console.error("Failed to process geocoding:", error);
    });

    return job.id;
  } catch (error) {
    console.error("Error starting geocoding job:", error);
    throw error;
  }
}

// Process geocoding in batches
async function processGeocodingBatches(jobId: string) {
  try {
    while (true) {
      // Call the edge function to process a batch
      const result = await callFn("geocode-properties", { jobId });
      
      // Check if there are more properties to process
      if (result.remaining === 0) {
        console.log("Geocoding complete");
        break;
      }
      
      // Wait a bit before processing next batch
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("Error processing geocoding batches:", error);
    // Update job as failed
    await supabase
      .from("geocoding_jobs")
      .update({ 
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        finished_at: new Date().toISOString()
      })
      .eq("id", jobId);
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