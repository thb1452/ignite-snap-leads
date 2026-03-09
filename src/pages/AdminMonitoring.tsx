import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, AlertTriangle, RefreshCw, Bug, Webhook, Activity, Server } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// ── Types ──
type SystemLog = {
  id: string;
  created_at: string;
  type: string;
  source: string;
  message: string;
  metadata: any;
  user_id: string | null;
};

type WebhookError = {
  id: string;
  created_at: string;
  webhook_type: string;
  event_type: string | null;
  event_id: string | null;
  error_message: string;
  payload: any;
  resolved: boolean;
  resolved_at: string | null;
};

type ErrorLog = {
  id: string;
  created_at: string;
  error_message: string;
  error_stack: string | null;
  severity: string;
  url: string | null;
  resolved: boolean;
  user_id: string | null;
};

// ── Hooks ──
function useSystemLogs() {
  return useQuery({
    queryKey: ["monitoring-system-logs"],
    queryFn: async () => {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { data, error } = await (supabase as any)
        .from("system_logs")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SystemLog[];
    },
    refetchInterval: 15000,
  });
}

function useWebhookErrors() {
  return useQuery({
    queryKey: ["monitoring-webhook-errors"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("webhook_errors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WebhookError[];
    },
    refetchInterval: 15000,
  });
}

function useErrorLogs() {
  return useQuery({
    queryKey: ["monitoring-error-logs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ErrorLog[];
    },
    refetchInterval: 15000,
  });
}

// ── Components ──
function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === "fatal" || severity === "error" ? "destructive" : "secondary";
  return <Badge variant={variant} className="text-xs">{severity}</Badge>;
}

function StatCard({ label, value, icon: Icon, variant = "default" }: {
  label: string;
  value: number;
  icon: any;
  variant?: "default" | "destructive" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-lg p-2 ${
          variant === "destructive" ? "bg-destructive/10 text-destructive" :
          variant === "warning" ? "bg-yellow-500/10 text-yellow-600" :
          "bg-primary/10 text-primary"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminMonitoring() {
  const queryClient = useQueryClient();
  const { data: systemLogs = [], isLoading: loadingLogs } = useSystemLogs();
  const { data: webhookErrors = [], isLoading: loadingWebhook } = useWebhookErrors();
  const { data: errorLogs = [], isLoading: loadingErrors } = useErrorLogs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resolveWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("webhook_errors")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring-webhook-errors"] });
      toast.success("Webhook error resolved");
    },
  });

  const resolveErrorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("error_logs")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring-error-logs"] });
      toast.success("Error resolved");
    },
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["monitoring-system-logs"] });
    queryClient.invalidateQueries({ queryKey: ["monitoring-webhook-errors"] });
    queryClient.invalidateQueries({ queryKey: ["monitoring-error-logs"] });
    toast.success("Refreshed");
  };

  const unresolvedErrors = errorLogs.filter((e) => !e.resolved).length;
  const unresolvedWebhooks = webhookErrors.filter((w) => !w.resolved).length;

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">System Monitoring</h1>
            <p className="text-sm text-muted-foreground">Real-time error, webhook, and system log monitoring</p>
          </div>
          <Button size="sm" variant="outline" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Unresolved Errors" value={unresolvedErrors} icon={Bug} variant={unresolvedErrors > 0 ? "destructive" : "default"} />
          <StatCard label="Webhook Failures" value={unresolvedWebhooks} icon={Webhook} variant={unresolvedWebhooks > 0 ? "warning" : "default"} />
          <StatCard label="System Logs (24h)" value={systemLogs.length} icon={Server} />
          <StatCard label="Total Errors (24h)" value={errorLogs.filter(l => new Date(l.created_at) > new Date(Date.now() - 86400000)).length} icon={AlertTriangle} variant={errorLogs.filter(l => new Date(l.created_at) > new Date(Date.now() - 86400000)).length > 0 ? "warning" : "default"} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="errors">
          <TabsList>
            <TabsTrigger value="errors" className="gap-1">
              <Bug className="h-4 w-4" /> Errors
              {unresolvedErrors > 0 && <Badge variant="destructive" className="ml-1 text-xs h-5 px-1">{unresolvedErrors}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1">
              <Webhook className="h-4 w-4" /> Webhooks
              {unresolvedWebhooks > 0 && <Badge variant="destructive" className="ml-1 text-xs h-5 px-1">{unresolvedWebhooks}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-1">
              <Server className="h-4 w-4" /> System Logs
            </TabsTrigger>
          </TabsList>

          {/* Errors Tab */}
          <TabsContent value="errors">
            <Card>
              <CardHeader><CardTitle className="text-lg">Frontend & Backend Errors</CardTitle></CardHeader>
              <CardContent>
                {loadingErrors ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
                ) : errorLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">No errors. All clear! 🎉</p>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px]">Time</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead className="w-[80px]">Severity</TableHead>
                          <TableHead className="w-[80px]">Status</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorLogs.map((log) => (
                          <TableRow key={log.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                            <TableCell className="text-xs font-mono text-muted-foreground">{format(new Date(log.created_at), "MMM d, HH:mm:ss")}</TableCell>
                            <TableCell>
                              <p className="text-sm font-medium truncate max-w-[400px]">{log.error_message}</p>
                              {expandedId === log.id && log.error_stack && (
                                <pre className="mt-2 text-xs text-muted-foreground bg-muted rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">{log.error_stack}</pre>
                              )}
                            </TableCell>
                            <TableCell><SeverityBadge severity={log.severity} /></TableCell>
                            <TableCell>{log.resolved ? <Badge variant="outline" className="text-green-600 text-xs">Resolved</Badge> : <Badge variant="destructive" className="text-xs">Open</Badge>}</TableCell>
                            <TableCell>
                              {!log.resolved && (
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); resolveErrorMutation.mutate(log.id); }}>
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                </Button>
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
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks">
            <Card>
              <CardHeader><CardTitle className="text-lg">Webhook Failures</CardTitle></CardHeader>
              <CardContent>
                {loadingWebhook ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
                ) : webhookErrors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">No webhook failures. All clear! 🎉</p>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px]">Time</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead className="w-[150px]">Event</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead className="w-[80px]">Status</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhookErrors.map((wh) => (
                          <TableRow key={wh.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)}>
                            <TableCell className="text-xs font-mono text-muted-foreground">{format(new Date(wh.created_at), "MMM d, HH:mm:ss")}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{wh.webhook_type}</Badge></TableCell>
                            <TableCell className="text-xs font-mono">{wh.event_type ?? "—"}</TableCell>
                            <TableCell>
                              <p className="text-sm truncate max-w-[300px]">{wh.error_message}</p>
                              {expandedId === wh.id && wh.payload && (
                                <pre className="mt-2 text-xs text-muted-foreground bg-muted rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(wh.payload, null, 2)}</pre>
                              )}
                            </TableCell>
                            <TableCell>{wh.resolved ? <Badge variant="outline" className="text-green-600 text-xs">Resolved</Badge> : <Badge variant="destructive" className="text-xs">Open</Badge>}</TableCell>
                            <TableCell>
                              {!wh.resolved && (
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); resolveWebhookMutation.mutate(wh.id); }}>
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                </Button>
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
          </TabsContent>

          {/* System Logs Tab */}
          <TabsContent value="system">
            <Card>
              <CardHeader><CardTitle className="text-lg">System Logs</CardTitle></CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
                ) : systemLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm">No system logs yet.</p>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px]">Time</TableHead>
                          <TableHead className="w-[80px]">Type</TableHead>
                          <TableHead className="w-[100px]">Source</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {systemLogs.map((log) => (
                          <TableRow key={log.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                            <TableCell className="text-xs font-mono text-muted-foreground">{format(new Date(log.created_at), "MMM d, HH:mm:ss")}</TableCell>
                            <TableCell><SeverityBadge severity={log.type} /></TableCell>
                            <TableCell className="text-xs">{log.source}</TableCell>
                            <TableCell>
                              <p className="text-sm truncate max-w-[400px]">{log.message}</p>
                              {expandedId === log.id && log.metadata && (
                                <pre className="mt-2 text-xs text-muted-foreground bg-muted rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
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
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
