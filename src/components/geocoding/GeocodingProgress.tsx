import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPin, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useGeocodingJob } from "@/hooks/useGeocodingJob";

export function GeocodingProgress() {
  const { job, progress, loading, error } = useGeocodingJob();

  if (!job && !loading) return null;

  const total = job?.total_properties ?? 0;
  const done = job?.geocoded_count ?? 0;
  const failed = job?.failed_count ?? 0;
  const status = job?.status ?? "idle";

  const isComplete = status === "completed";
  const isFailed = status === "failed";
  const isRunning = status === "running" || status === "queued";

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
                {isRunning && `Geocoding ${done} / ${total} properties`}
                {!job && loading && "Loading..."}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {progress}%
            </span>
          </div>
          
          <Progress value={progress} className="h-2" />
          
          {failed > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {failed} failed
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive mt-2">
              Error: {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
