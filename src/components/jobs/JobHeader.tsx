import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Job, rerunFailedJob, exportJobCSV } from "@/services/jobs";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_MAP = {
  queued: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Queued' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Partial' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

interface JobHeaderProps {
  job: Job;
}

export function JobHeader({ job }: JobHeaderProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const statusInfo = STATUS_MAP[job.status];
  const jobNumber = job.id.slice(0, 8).toUpperCase();
  const hasFailed = (job.counts?.failed ?? 0) > 0;

  const rerunMutation = useMutation({
    mutationFn: () => rerunFailedJob(job.id),
    onSuccess: (data) => {
      toast({
        title: "Job created",
        description: `Re-running ${data.total} failed properties`,
      });
      navigate(`/jobs/${data.job_id}`);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to create job",
        description: error.message,
      });
    },
  });

  const handleExport = async () => {
    try {
      await exportJobCSV(job.id);
      toast({
        title: "Export started",
        description: "CSV download will begin shortly",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error.message,
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/leads')}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Job #{jobNumber}</h1>
            <Badge className={`${statusInfo.bg} ${statusInfo.text} border-0`}>
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {job.counts.total} properties • Started {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {hasFailed && job.finished_at && (
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => rerunMutation.mutate()}
            disabled={rerunMutation.isPending}
          >
            <RefreshCw className="h-4 w-4" />
            Re-run Failed ({job.counts.failed})
          </Button>
        )}
        
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          onClick={handleExport}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
