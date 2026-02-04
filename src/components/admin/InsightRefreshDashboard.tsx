import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Play,
  Pause,
  TrendingUp,
  Clock
} from "lucide-react";
import { toast } from "sonner";

interface InsightStats {
  total: number;
  missing: number;
  outdated: number;
  clean: number;
  lastUpdated: Date;
}

const OUTDATED_TERMS = [
  'distress', 'opportunity', 'motivated', 'acquisition', 
  'investor', 'deal', 'value-add', 'value add', 'flip',
  'wholesale', 'profit', 'below market', 'discounted'
];

export function InsightRefreshDashboard() {
  const [stats, setStats] = useState<InsightStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobRunning, setJobRunning] = useState(false);
  const [progress, setProgress] = useState<{current: number; total: number; percentage: number} | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = async () => {
    try {
      // Get total count
      const { count: total } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true });

      // Get missing insights count
      const { count: missing } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .is("snap_insight", null);

      // Build OR condition for outdated terms
      const orConditions = OUTDATED_TERMS.map(term => `snap_insight.ilike.%${term}%`).join(',');

      // Get outdated insights count
      const { count: outdated } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .not("snap_insight", "is", null)
        .or(orConditions);

      const clean = (total || 0) - (missing || 0) - (outdated || 0);

      setStats({
        total: total || 0,
        missing: missing || 0,
        outdated: outdated || 0,
        clean: Math.max(0, clean),
        lastUpdated: new Date()
      });
    } catch (err) {
      console.error("Failed to fetch insight stats:", err);
      toast.error("Failed to load insight stats");
    } finally {
      setLoading(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    fetchStats();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Start polling when job is running
  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    // Poll every 5 seconds while job is running
    pollingRef.current = setInterval(() => {
      fetchStats();
    }, 5000);
  }, []);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  const startRefreshJob = async () => {
    try {
      setJobRunning(true);
      toast.info("Starting insight refresh job...");

      // Start polling for live updates
      startPolling();

      const { data, error } = await supabase.functions.invoke('refresh-outdated-insights', {
        body: { autoResume: true }
      });

      if (error) throw error;

      if (data.progress) {
        setProgress(data.progress);
      }

      toast.success(`Refresh started: ${data.processed} processed in first batch`);
      
      // Refresh stats immediately after starting
      fetchStats();

      // Check if job completed in this batch
      if (data.progress?.percentage >= 100 || data.remaining === 0) {
        setJobRunning(false);
        stopPolling();
        toast.success("All insights refreshed!");
      }
    } catch (err) {
      console.error("Failed to start refresh job:", err);
      toast.error("Failed to start refresh job");
      setJobRunning(false);
      stopPolling();
    }
  };

  const cleanPercentage = stats ? Math.round((stats.clean / stats.total) * 100) : 0;
  const outdatedPercentage = stats ? Math.round((stats.outdated / stats.total) * 100) : 0;
  const missingPercentage = stats ? Math.round((stats.missing / stats.total) * 100) : 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Insight Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-8 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Insight Regeneration Status
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={startRefreshJob}
              disabled={jobRunning}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Total Properties</p>
            <p className="text-2xl font-bold">{stats?.total.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-green-100 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">Clean Insights</p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">
              {stats?.clean.toLocaleString()}
            </p>
            <Badge variant="secondary" className="mt-1">{cleanPercentage}%</Badge>
          </div>
          <div className="text-center p-4 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
            <p className="text-sm text-orange-800 dark:text-orange-200">Outdated Language</p>
            <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
              {stats?.outdated.toLocaleString()}
            </p>
            <Badge variant="secondary" className="mt-1">{outdatedPercentage}%</Badge>
          </div>
          <div className="text-center p-4 bg-red-100 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">Missing Insights</p>
            <p className="text-2xl font-bold text-red-900 dark:text-red-100">
              {stats?.missing.toLocaleString()}
            </p>
            <Badge variant="secondary" className="mt-1">{missingPercentage}%</Badge>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Health</span>
            <span className="font-medium">{cleanPercentage}% Clean</span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-green-500 transition-all duration-500"
              style={{ width: `${cleanPercentage}%` }}
            />
            <div 
              className="bg-orange-500 transition-all duration-500"
              style={{ width: `${outdatedPercentage}%` }}
            />
            <div 
              className="bg-red-500 transition-all duration-500"
              style={{ width: `${missingPercentage}%` }}
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full" /> Clean
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-orange-500 rounded-full" /> Outdated
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full" /> Missing
            </span>
          </div>
        </div>

        {/* Job Progress (if running) */}
        {progress && (
          <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">Refresh Job Running</span>
              </div>
              <Badge>{progress.percentage}%</Badge>
            </div>
            <Progress value={progress.percentage} className="h-2" />
            <p className="text-sm text-muted-foreground">
              {progress.current.toLocaleString()} / {progress.total.toLocaleString()} properties processed
            </p>
          </div>
        )}

        {/* Last Updated */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Last updated: {stats?.lastUpdated.toLocaleTimeString()}
        </div>

        {/* Action Summary */}
        <div className="pt-4 border-t space-y-2">
          <h4 className="font-medium text-sm">What needs fixing:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            {stats?.outdated && stats.outdated > 0 && (
              <li className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                {stats.outdated.toLocaleString()} insights use investor language (will be replaced with neutral enforcement language)
              </li>
            )}
            {stats?.missing && stats.missing > 0 && (
              <li className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                {stats.missing.toLocaleString()} properties have no insights yet
              </li>
            )}
            {stats?.clean === stats?.total && (
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                All insights are up to date!
              </li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
