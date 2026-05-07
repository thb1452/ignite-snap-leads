// TODO(types): Remove `as any` cast once Supabase types are regenerated
// post-staging-apply. See PR #156 description for context.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

type QueueRow = {
  status: string;
  job_count: number;
  oldest_pending_at: string | null;
  oldest_pending_age_seconds: number | null;
};

type StaleRow = {
  source_id: string;
  state: string | null;
  jurisdiction: string | null;
  county: string | null;
  city: string | null;
  source_type: string | null;
  portal_vendor: string | null;
  last_response_at: string | null;
  days_since_last_response: number | null;
};

type FailedRow = {
  domain: string;
  job_id: string;
  job_subtype: string | null;
  status: string;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function useFoiaQueueHealth() {
  return useQuery({
    queryKey: ["ops-foia-queue-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_foia_queue_health")
        .select("*");
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
    refetchInterval: 15000,
  });
}

function useStaleJurisdictions() {
  return useQuery({
    queryKey: ["ops-stale-jurisdictions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_stale_jurisdictions")
        .select("*")
        .limit(50);
      if (error) throw error;
      return (data ?? []) as StaleRow[];
    },
    refetchInterval: 60000,
  });
}

function useFailedFoiaJobs() {
  return useQuery({
    queryKey: ["ops-failed-foia-24h"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_failed_jobs_last_24h")
        .select("*")
        .eq("domain", "foia")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FailedRow[];
    },
    refetchInterval: 15000,
  });
}

function formatAge(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function FoiaQueueCard() {
  const { data: queue = [], isLoading: loadingQueue } = useFoiaQueueHealth();
  const { data: stale = [], isLoading: loadingStale } = useStaleJurisdictions();
  const { data: failed = [], isLoading: loadingFailed } = useFailedFoiaJobs();

  const totalJobs = queue.reduce((sum, r) => sum + (r.job_count ?? 0), 0);
  const pendingRow = queue.find((r) => r.status === "pending");
  const oldestPendingAge = pendingRow?.oldest_pending_age_seconds ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" /> FOIA queue health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingQueue ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No jobs yet. Queue is empty.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {queue.map((r) => (
                  <Badge key={r.status} variant="outline" className="text-xs">
                    {r.status}: {r.job_count}
                  </Badge>
                ))}
                <Badge variant="secondary" className="text-xs">
                  total: {totalJobs}
                </Badge>
              </div>
              {oldestPendingAge != null && (
                <p className="text-xs text-muted-foreground">
                  Oldest pending/drafted: {formatAge(oldestPendingAge)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" /> Stale jurisdictions ({">"}90 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingStale ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
          ) : stale.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm">All jurisdictions fresh.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">State</TableHead>
                    <TableHead>Jurisdiction</TableHead>
                    <TableHead className="w-[140px]">Portal vendor</TableHead>
                    <TableHead className="w-[120px]">Source type</TableHead>
                    <TableHead className="text-right w-[120px]">Last response</TableHead>
                    <TableHead className="text-right w-[100px]">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stale.map((row) => (
                    <TableRow key={row.source_id}>
                      <TableCell className="font-mono text-xs">{row.state ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.jurisdiction ?? row.county ?? "—"}</TableCell>
                      <TableCell className="text-xs">{row.portal_vendor ?? "—"}</TableCell>
                      <TableCell className="text-xs">{row.source_type ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">
                        {row.last_response_at
                          ? format(new Date(row.last_response_at), "MMM d, yyyy")
                          : "never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-xs">
                          {row.days_since_last_response == null
                            ? "∞"
                            : Math.round(row.days_since_last_response)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Failed FOIA jobs (last 24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingFailed ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
          ) : failed.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm">No failed FOIA jobs in the last 24 hours.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Updated</TableHead>
                    <TableHead className="w-[140px]">Request type</TableHead>
                    <TableHead className="w-[80px]">Retries</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failed.map((row) => (
                    <TableRow key={row.job_id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {format(new Date(row.updated_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-sm">{row.job_subtype ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{row.retry_count}</TableCell>
                      <TableCell className="text-sm truncate max-w-[400px]">
                        {row.error_message ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
