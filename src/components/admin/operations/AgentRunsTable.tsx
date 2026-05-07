// TODO(types): Remove `as any` cast once Supabase types are regenerated
// post-staging-apply. See PR #156 description for context.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";
import { format } from "date-fns";

type AgentRunRow = {
  id: number;
  agent_name: string;
  job_table: string;
  job_id: string;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  error_message: string | null;
  duration_ms: number | null;
  tokens_used: number | null;
  cost_usd: number | null;
  created_at: string;
};

function useRecentAgentRuns() {
  return useQuery({
    queryKey: ["ops-recent-agent-runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_recent_agent_runs")
        .select("*");
      if (error) throw error;
      return (data ?? []) as AgentRunRow[];
    },
    refetchInterval: 15000,
  });
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "failed":
      return "destructive";
    case "needs_review":
      return "secondary";
    case "completed":
      return "outline";
    default:
      return "default";
  }
}

function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCost(usd: number | null) {
  if (usd == null) return "—";
  return `$${usd.toFixed(4)}`;
}

export function AgentRunsTable() {
  const { data: rows = [], isLoading } = useRecentAgentRuns();

  const totalCost = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const totalTokens = rows.reduce((s, r) => s + (r.tokens_used ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" /> Recent agent runs (last 100)
        </CardTitle>
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Total cost: ${totalCost.toFixed(4)} · Tokens: {totalTokens.toLocaleString()}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No agent runs yet. Agents will populate this table as they execute.
          </p>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Time</TableHead>
                  <TableHead className="w-[120px]">Agent</TableHead>
                  <TableHead className="w-[140px]">Job table</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="text-right w-[90px]">Duration</TableHead>
                  <TableHead className="text-right w-[80px]">Tokens</TableHead>
                  <TableHead className="text-right w-[80px]">Cost</TableHead>
                  <TableHead>Output / error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {format(new Date(row.created_at), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{row.agent_name}</TableCell>
                    <TableCell className="text-xs font-mono">{row.job_table}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)} className="text-xs">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {formatDuration(row.duration_ms)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {row.tokens_used?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {formatCost(row.cost_usd)}
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[300px]">
                      {row.error_message ?? row.output_summary ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
