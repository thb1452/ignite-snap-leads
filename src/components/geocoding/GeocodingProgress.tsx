import { useGeocodingJob } from "@/hooks/useGeocodingJob";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPin, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface GeocodingProgressProps {
  jobId: string | null;
}

export function GeocodingProgress({ jobId }: GeocodingProgressProps) {
  const { job, loading } = useGeocodingJob(jobId);

  if (!jobId || loading || !job) return null;

  const progress = job.total_properties > 0 
    ? (job.geocoded_count / job.total_properties) * 100 
    : 0;

  const isComplete = job.status === "completed";
  const isFailed = job.status === "failed";
  const isRunning = job.status === "running";

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
                {isRunning && `Geocoding ${job.geocoded_count} / ${job.total_properties} properties`}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          
          <Progress value={progress} className="h-2" />
          
          {job.failed_count > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {job.failed_count} failed
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}