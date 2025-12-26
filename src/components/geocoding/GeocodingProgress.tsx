import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPin, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useGeocodingJob } from "@/hooks/useGeocodingJob";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function GeocodingProgress() {
  const { job, loading, error } = useGeocodingJob();

  // Get actual counts from database (more reliable than job counters which may lag)
  const { data: dbCounts } = useQuery({
    queryKey: ["geocoding-db-counts", job?.id],
    queryFn: async () => {
      const [withCoords, needsGeo] = await Promise.all([
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .not("latitude", "is", null)
          .neq("latitude", 0),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .is("latitude", null),
      ]);
      return {
        geocoded: withCoords.count ?? 0,
        remaining: needsGeo.count ?? 0,
      };
    },
    enabled: !!job && (job.status === "running" || job.status === "queued"),
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  if (!job && !loading) return null;

  const total = job?.total_properties ?? 0;
  const status = job?.status ?? "idle";
  
  // Use DB counts for running jobs (more accurate), job counters for completed
  const done = status === "running" || status === "queued" 
    ? (dbCounts?.geocoded ?? job?.geocoded_count ?? 0)
    : (job?.geocoded_count ?? 0);
  const remaining = dbCounts?.remaining ?? 0;
  const failed = job?.failed_count ?? 0;
  const skipped = job?.skipped_count ?? 0;

  const isComplete = status === "completed";
  const isFailed = status === "failed";
  const isRunning = status === "running" || status === "queued";

  // Calculate progress based on actual remaining vs initial total
  const progress = isRunning && total > 0
    ? Math.min(100, Math.round(((total - remaining) / total) * 100))
    : isComplete ? 100 : 0;

  return (
    <Card className="p-4 bg-background/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center gap-3">
        {isRunning && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
        {isComplete && <CheckCircle2 className="h-5 w-5 text-green-500" />}
        {isFailed && <XCircle className="h-5 w-5 text-destructive" />}
        
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {isComplete && "Geocoding Complete"}
                {isFailed && "Geocoding Failed"}
                {isRunning && `Geocoding... ${remaining.toLocaleString()} remaining`}
                {!job && loading && "Loading..."}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {progress}%
            </span>
          </div>
          
          <Progress value={progress} className="h-2" />

          <div className="flex gap-3 mt-2 text-xs">
            {isRunning && (
              <span className="text-muted-foreground">
                ✓ {done.toLocaleString()} geocoded
              </span>
            )}
            {skipped > 0 && (
              <span className="text-muted-foreground">
                ⊘ {skipped} skipped (no address)
              </span>
            )}
            {failed > 0 && (
              <span className="text-destructive">
                ✗ {failed} failed
              </span>
            )}
          </div>

          {isFailed && job?.error_message && (
            <p className="text-xs text-destructive mt-2">
              Error: {job.error_message}
            </p>
          )}

          {isFailed && !job?.error_message && (
            <p className="text-xs text-muted-foreground mt-2">
              Job failed - you can start a new geocoding job.
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive mt-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
