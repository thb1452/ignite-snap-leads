import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const STATUS_CONFIG = {
  queued: { icon: Clock, bg: 'bg-gray-100', text: 'text-gray-700', label: 'Queued' },
  processing: { icon: Clock, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  partial: { icon: AlertTriangle, bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Partial' },
  completed: { icon: CheckCircle2, bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
  failed: { icon: XCircle, bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

export default function Jobs() {
  const navigate = useNavigate();

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skiptrace_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Skip Trace Jobs</h1>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Skip Trace Jobs</h1>

      {jobs && jobs.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No jobs yet. Start a skip trace from the Leads page.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs?.map((job) => {
            const config = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG];
            const Icon = config.icon;
            const counts = job.counts as any || { total: 0, succeeded: 0, failed: 0 };
            const duration = job.finished_at 
              ? Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at || job.created_at).getTime()) / 1000)
              : null;

            return (
              <Card
                key={job.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/jobs/${job.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">Job #{job.id.slice(0, 8).toUpperCase()}</h3>
                      <Badge className={`${config.bg} ${config.text} border-0 shrink-0`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{counts.total} properties</span>
                      {counts.succeeded > 0 && (
                        <span className="text-green-600">{counts.succeeded} success</span>
                      )}
                      {counts.failed > 0 && (
                        <span className="text-yellow-600">{counts.failed} refunded</span>
                      )}
                      {duration && (
                        <span>{Math.floor(duration / 60)}m {duration % 60}s</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-sm text-muted-foreground shrink-0">
                    {new Date(job.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
