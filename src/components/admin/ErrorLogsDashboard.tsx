import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, RefreshCw, Bug } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type ErrorLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  error_message: string;
  error_stack: string | null;
  component_stack: string | null;
  url: string | null;
  severity: string;
  resolved: boolean;
  resolved_at: string | null;
  user_agent: string | null;
};

type FilterMode = "all" | "unresolved" | "resolved";

export function ErrorLogsDashboard() {
  const [filter, setFilter] = useState<FilterMode>("unresolved");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["error-logs", filter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter === "unresolved") query = query.eq("resolved", false);
      if (filter === "resolved") query = query.eq("resolved", true);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ErrorLog[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("error_logs")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
      toast.success("Error marked as resolved");
    },
  });

  const unresolvedCount = logs.filter((l: ErrorLog) => !l.resolved).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg">Error Logs</CardTitle>
          {unresolvedCount > 0 && (
            <Badge variant="destructive">{unresolvedCount} unresolved</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(["unresolved", "all", "resolved"] as FilterMode[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Loading…</p>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">No errors found. All clear! 🎉</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Time</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[80px]">Severity</TableHead>
                  <TableHead className="w-[200px]">Page</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: ErrorLog) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium truncate max-w-[400px]">
                        {log.error_message}
                      </p>
                      {expandedId === log.id && log.error_stack && (
                        <pre className="mt-2 text-xs text-muted-foreground bg-muted rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                          {log.error_stack}
                        </pre>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={log.severity === "fatal" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {log.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {log.url ? new URL(log.url).pathname : "—"}
                    </TableCell>
                    <TableCell>
                      {!log.resolved ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            resolveMutation.mutate(log.id);
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </Button>
                      ) : (
                        <span className="text-xs text-green-600">Resolved</span>
                      )}
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
