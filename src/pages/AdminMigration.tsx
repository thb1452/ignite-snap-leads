import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Play, 
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TableStatus {
  source: number;
  target: number;
}

interface TableProgress {
  cursor: string | null;
  rowsMigrated: number;
  complete: boolean;
}

interface MigrationProgress {
  tableIndex: number;
  tableProgress: Record<string, TableProgress>;
  totalMigrated: number;
  lastUpdated: string;
}

interface MigrationState {
  status: "idle" | "checking" | "migrating" | "verifying" | "complete" | "error";
  tables: Record<string, TableStatus>;
  currentTable: string | null;
  progress: number;
  totalRows: number;
  migratedRows: number;
  errors: string[];
}

// Updated list - removed deprecated skiptrace tables
const TABLES_TO_MIGRATE = [
  "jurisdictions",
  "organizations", 
  "counties",
  "properties",
  "violations",
  "foia_templates",
  "foia_requests",
  "clean_leads",
  "email_templates",
  "email_preferences",
  "email_analytics",
  "lead_lists",
  "list_properties",
  "lead_activity",
  "upload_jobs",
  "upload_staging",
  "user_profiles",
  "user_roles",
  "user_subscriptions",
  "user_allowed_states",
  "user_invitations",
  "call_logs",
  "property_contacts",
  "credit_ledger",
  "geocoding_jobs",
  "staging_uploads",
];

const STORAGE_KEY = "snap_migration_progress";

function loadProgress(): MigrationProgress | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveProgress(progress: MigrationProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...progress,
      lastUpdated: new Date().toISOString(),
    }));
  } catch (e) {
    console.warn("Failed to save progress:", e);
  }
}

function clearProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function AdminMigration() {
  const { toast } = useToast();
  const [state, setState] = useState<MigrationState>({
    status: "idle",
    tables: {},
    currentTable: null,
    progress: 0,
    totalRows: 0,
    migratedRows: 0,
    errors: [],
  });
  const [savedProgress, setSavedProgress] = useState<MigrationProgress | null>(null);

  // Load saved progress on mount
  useEffect(() => {
    const progress = loadProgress();
    if (progress) {
      setSavedProgress(progress);
      setState(prev => ({
        ...prev,
        migratedRows: progress.totalMigrated,
      }));
    }
  }, []);

  const checkStatus = async () => {
    setState(prev => ({ ...prev, status: "checking", errors: [] }));
    
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migrate-to-external`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      
      const res = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "get-status" }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      
      const data = await res.json();

      const totalRows = Object.values(data.tables as Record<string, TableStatus>)
        .reduce((sum, t) => sum + t.source, 0);

      setState(prev => ({
        ...prev,
        status: "idle",
        tables: data.tables,
        totalRows,
      }));

      toast({
        title: "Status Retrieved",
        description: `Found ${totalRows.toLocaleString()} total rows across ${data.totalTables} tables`,
      });

      if (!data.ready) {
        toast({
          title: "Schema Not Ready",
          description: "Some tables don't exist in target database. Run schema migration first.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Status check failed:", error);
      const message = error.name === 'AbortError' 
        ? "Request timed out (45s). The database may be under heavy load - try again."
        : error.message;
      setState(prev => ({ 
        ...prev, 
        status: "error",
        errors: [...prev.errors, message]
      }));
      toast({
        title: "Status Check Failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const startMigration = async (resume = false) => {
    // Load existing progress if resuming
    let migrationProgress: MigrationProgress = resume && savedProgress ? savedProgress : {
      tableIndex: 0,
      tableProgress: {},
      totalMigrated: 0,
      lastUpdated: new Date().toISOString(),
    };

    const startIndex = migrationProgress.tableIndex;
    let totalMigrated = migrationProgress.totalMigrated;

    setState(prev => ({ 
      ...prev, 
      status: "migrating",
      migratedRows: totalMigrated,
      errors: [],
    }));

    if (resume) {
      toast({
        title: "Resuming Migration",
        description: `Continuing from table ${TABLES_TO_MIGRATE[startIndex]} (${totalMigrated.toLocaleString()} rows already migrated)`,
      });
    }

    for (let i = startIndex; i < TABLES_TO_MIGRATE.length; i++) {
      const table = TABLES_TO_MIGRATE[i];
      
      setState(prev => ({ 
        ...prev, 
        currentTable: table,
        progress: (i / TABLES_TO_MIGRATE.length) * 100,
      }));

      // Get saved cursor for this table if resuming
      const tableState = migrationProgress.tableProgress[table];
      let cursor: string | null = tableState?.cursor || null;
      let hasMore = !tableState?.complete;
      let retryCount = 0;
      const maxRetries = 3;

      if (tableState?.complete) {
        // Table already done, skip
        continue;
      }

      while (hasMore) {
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migrate-to-external`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ action: "migrate-table", table, cursor }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || `HTTP ${res.status}`);
          }
          
          const data = await res.json();

          if (data.status === "error") {
            if (data.error?.includes("timeout") && retryCount < maxRetries) {
              retryCount++;
              console.log(`Timeout on ${table} (retry ${retryCount}/${maxRetries}), waiting 2s...`);
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            setState(prev => ({
              ...prev,
              errors: [...prev.errors, `${table}: ${data.error}`]
            }));
            if (!data.hasMore) break;
          }

          // Success - update progress
          retryCount = 0;
          totalMigrated += data.rowsMigrated || 0;
          hasMore = data.hasMore;
          cursor = data.nextCursor;

          // Save progress after each batch
          migrationProgress = {
            tableIndex: i,
            tableProgress: {
              ...migrationProgress.tableProgress,
              [table]: {
                cursor,
                rowsMigrated: (migrationProgress.tableProgress[table]?.rowsMigrated || 0) + (data.rowsMigrated || 0),
                complete: !hasMore,
              }
            },
            totalMigrated,
            lastUpdated: new Date().toISOString(),
          };
          saveProgress(migrationProgress);
          setSavedProgress(migrationProgress);

          setState(prev => ({
            ...prev,
            migratedRows: totalMigrated,
          }));

          if (hasMore) {
            await new Promise(r => setTimeout(r, 25));
          }

        } catch (error: any) {
          console.error(`Migration failed for ${table}:`, error);
          if ((error.message?.includes("fetch") || error.message?.includes("network")) && retryCount < maxRetries) {
            retryCount++;
            console.log(`Network error on ${table} (retry ${retryCount}/${maxRetries}), waiting 3s...`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          setState(prev => ({
            ...prev,
            errors: [...prev.errors, `${table}: ${error.message}`]
          }));
          
          // Save progress before breaking so we can resume
          saveProgress(migrationProgress);
          setSavedProgress(migrationProgress);
          
          setState(prev => ({ ...prev, status: "error" }));
          toast({
            title: "Migration Paused",
            description: `Error on ${table}. Click "Resume" to continue from where you left off.`,
            variant: "destructive",
          });
          return; // Exit without clearing progress
        }
      }

      // Mark table as complete and move to next
      migrationProgress.tableIndex = i + 1;
      migrationProgress.tableProgress[table] = {
        ...migrationProgress.tableProgress[table],
        complete: true,
      };
      saveProgress(migrationProgress);
    }

    // Clear progress on successful completion
    clearProgress();
    setSavedProgress(null);

    setState(prev => ({ 
      ...prev, 
      status: "complete",
      currentTable: null,
      progress: 100,
    }));

    toast({
      title: "Migration Complete",
      description: `Migrated ${totalMigrated.toLocaleString()} rows across ${TABLES_TO_MIGRATE.length} tables`,
    });
  };

  const resetProgress = () => {
    clearProgress();
    setSavedProgress(null);
    setState(prev => ({
      ...prev,
      migratedRows: 0,
      progress: 0,
      errors: [],
    }));
    toast({
      title: "Progress Reset",
      description: "Migration will start from the beginning next time.",
    });
  };

  const verifyMigration = async () => {
    setState(prev => ({ ...prev, status: "verifying" }));

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migrate-to-external`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "verify" }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }
      
      const data = await res.json();

      toast({
        title: data.allMatch ? "Verification Passed" : "Verification Warning",
        description: data.summary,
        variant: data.allMatch ? "default" : "destructive",
      });

      setState(prev => ({ ...prev, status: "complete", tables: data.tables }));
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
      setState(prev => ({ ...prev, status: "error" }));
    }
  };

  const getTableStatusIcon = (source: number, target: number) => {
    if (target === -1) return <XCircle className="h-4 w-4 text-destructive" />;
    if (target === source) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (target > 0) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <ArrowRight className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Database className="h-8 w-8" />
            Database Migration
          </h1>
          <p className="text-muted-foreground">
            Migrate data from Lovable Cloud to Supabase Pro
          </p>
        </div>

        <div className="space-y-6">
          {/* Saved Progress Banner */}
          {savedProgress && state.status !== "migrating" && (
            <Alert>
              <RefreshCw className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  <strong>Saved progress found:</strong> {savedProgress.totalMigrated.toLocaleString()} rows migrated 
                  ({TABLES_TO_MIGRATE[savedProgress.tableIndex] || "complete"})
                  <span className="text-muted-foreground ml-2 text-xs">
                    Last updated: {new Date(savedProgress.lastUpdated).toLocaleString()}
                  </span>
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => startMigration(true)}>
                    <Play className="h-3 w-3 mr-1" /> Resume
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetProgress}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Migration Status</CardTitle>
              <CardDescription>
                Check connection and table status before migrating
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <Button 
                  onClick={checkStatus} 
                  disabled={state.status === "checking" || state.status === "migrating"}
                  variant="outline"
                >
                  {state.status === "checking" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Check Status
                </Button>

                {savedProgress ? (
                  <Button 
                    onClick={() => startMigration(true)}
                    disabled={state.status === "migrating"}
                  >
                    {state.status === "migrating" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Resume Migration
                  </Button>
                ) : (
                  <Button 
                    onClick={() => startMigration(false)}
                    disabled={state.status === "migrating" || Object.keys(state.tables).length === 0}
                  >
                    {state.status === "migrating" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Start Migration
                  </Button>
                )}

                <Button 
                  onClick={verifyMigration}
                  disabled={state.status === "verifying" || state.status === "migrating"}
                  variant="secondary"
                >
                  {state.status === "verifying" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Verify
                </Button>
              </div>

              {state.status === "migrating" && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Migrating: {state.currentTable}</span>
                    <span>{state.migratedRows.toLocaleString()} rows</span>
                  </div>
                  <Progress value={state.progress} className="h-2" />
                </div>
              )}

              {state.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc list-inside text-sm">
                      {state.errors.slice(-5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Table Status */}
          {Object.keys(state.tables).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Table Status</CardTitle>
                <CardDescription>
                  Source (Lovable Cloud) → Target (Supabase Pro)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                  {Object.entries(state.tables).map(([table, counts]) => (
                    <div 
                      key={table}
                      className="flex items-center justify-between p-2 rounded border bg-card"
                    >
                      <div className="flex items-center gap-2">
                        {getTableStatusIcon(counts.source, counts.target)}
                        <span className="text-sm font-medium">{table}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{counts.source.toLocaleString()}</Badge>
                        <ArrowRight className="h-3 w-3" />
                        <Badge variant={counts.target === counts.source ? "default" : "secondary"}>
                          {counts.target === -1 ? "N/A" : counts.target.toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Before migrating:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                <li>Run the schema SQL in your Supabase Pro SQL Editor to create tables</li>
                <li>Click "Check Status" to verify all tables exist in target</li>
                <li>Click "Start Migration" to copy all data</li>
                <li>If interrupted, click "Resume" to continue from where you left off</li>
                <li>Click "Verify" to confirm row counts match</li>
              </ol>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </AppLayout>
  );
}
