import { Job, JobEvent } from "@/services/jobs";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertTriangle, RefreshCw } from "lucide-react";

interface JobTimelineProps {
  events: JobEvent[];
  job: Job;
}

const EVENT_ICONS = {
  job_queued: Clock,
  job_started: RefreshCw,
  job_refunded: AlertTriangle,
  job_done: CheckCircle2,
};

const EVENT_LABELS = {
  job_queued: 'Job Created',
  job_started: 'Processing Started',
  job_refunded: 'Credits Refunded',
  job_done: 'Job Completed',
};

export function JobTimeline({ events, job }: JobTimelineProps) {
  if (events.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">No events yet</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {events.map((event, index) => {
          const Icon = EVENT_ICONS[event.type as keyof typeof EVENT_ICONS] || Clock;
          const label = EVENT_LABELS[event.type as keyof typeof EVENT_LABELS] || event.type;
          const isLast = index === events.length - 1;

          return (
            <div key={`${event.type}-${event.timestamp}`} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="rounded-full bg-primary/10 p-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                {!isLast && (
                  <div className="w-px h-full bg-border mt-2" />
                )}
              </div>

              <div className="flex-1 pb-6">
                <h3 className="font-medium mb-1">{label}</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(event.timestamp).toLocaleString()}
                </p>
                
                {event.type === 'job_refunded' && event.payload.count && (
                  <p className="text-sm text-yellow-600 mt-2">
                    {event.payload.count} credits refunded for failed properties
                  </p>
                )}
                
                {event.type === 'job_done' && (
                  <div className="text-sm mt-2 space-y-1">
                    <p className="text-green-600">
                      ✓ {event.payload.succeeded} successful
                    </p>
                    {event.payload.failed > 0 && (
                      <p className="text-muted-foreground">
                        {event.payload.failed} no match or failed
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
