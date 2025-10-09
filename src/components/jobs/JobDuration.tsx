import { useEffect, useState } from "react";
import { Job } from "@/services/jobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

interface JobDurationProps {
  job: Job;
}

export function JobDuration({ job }: JobDurationProps) {
  const [elapsed, setElapsed] = useState<string>('0s');

  useEffect(() => {
    if (!job.started_at) {
      setElapsed('Not started');
      return;
    }

    const updateDuration = () => {
      const start = new Date(job.started_at!).getTime();
      const end = job.finished_at ? new Date(job.finished_at).getTime() : Date.now();
      const diffMs = end - start;
      
      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      
      if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds}s`);
      } else {
        setElapsed(`${seconds}s`);
      }
    };

    updateDuration();
    
    // Only update if job is still running
    if (!job.finished_at) {
      const interval = setInterval(updateDuration, 1000);
      return () => clearInterval(interval);
    }
  }, [job.started_at, job.finished_at]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Duration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {elapsed}
        </div>
        {!job.finished_at && job.started_at && (
          <p className="text-xs text-muted-foreground mt-1">Running...</p>
        )}
      </CardContent>
    </Card>
  );
}
