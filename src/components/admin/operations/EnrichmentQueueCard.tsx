// TODO(types): Remove `as any` cast once Supabase types are regenerated
// post-staging-apply. See PR #156 description for context.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type QueueRow = {
  status: string;
  job_count: number;
  oldest_pending_at: string | null;
  oldest_pending_age_seconds: number | null;
};

type CoverageRow = {
  state: string | null;
  county: string | null;
  total_properties: number;
  enriched_properties: number;
  coverage_pct: number | null;
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

function useEnrichmentQueueHealth() {
  return useQuery({
    queryKey: ["ops-enrichment-queue-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_enrichment_queue_health")
        .select("*");
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
    refetchInterval: 15000,
  });
}

function useEnrichmentCoverage() {
  return useQuery({
    queryKey: ["ops-enrichment-coverage"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_enrichment_coverage_by_county")
        .select("*")
        .order("total_properties", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as CoverageRow[];
    },
    refetchInterval: 60000,
  });
}

function useFailedEnrichmentJobs() {
  return useQuery({
    queryKey: ["ops-failed-enrichment-24h"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_failed_jobs_last_24h")
        .select("*")
        .eq("domain", "enrichment")
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

export function EnrichmentQueueCard() {
  const { data: queue = [], isLoading: loadingQueue } = useEnrichmentQueueHealth();
  const { data: coverage = [], isLoading: loadingCoverage } = useEnrichmentCoverage();
  const { data: failed = [], isLoading: loadingFailed } = useFailedEnrichmentJobs();

  const totalJobs = queue.reduce((sum, r) => sum + (r.job_count ?? 0), 0);
  const pendingRow = queue.find((r) => r.status === "pending");
  const oldestPendingAge = pendingRow?.oldest_pending_age_seconds ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" /> Enrichment queue health
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
                  Oldest pending: {formatAge(oldestPendingAge)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Coverage by county (top 25)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCoverage ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
          ) : coverage.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No counties found in properties.
            </p>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">State</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead className="text-right w-[120px]">Properties</TableHead>
                    <TableHead className="text-right w-[120px]">Enriched</TableHead>
                    <TableHead className="text-right w-[100px]">Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.map((row, i) => (
                    <TableRow key={`${row.state}-${row.county}-${i}`}>
                      <TableCell className="font-mono text-xs">{row.state ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.county ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.total_properties.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.enriched_properties.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={(row.coverage_pct ?? 0) >= 80 ? "outline" : "secondary"} className="text-xs">
                          {row.coverage_pct == null ? "—" : `${row.coverage_pct}%`}
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
            <AlertTriangle className="h-5 w-5" /> Failed enrichment jobs (last 24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingFailed ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
          ) : failed.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm">No failed enrichment jobs in the last 24 hours.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Updated</TableHead>
                    <TableHead className="w-[140px]">Type</TableHead>
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
