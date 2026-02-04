import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface BatchRescoreProgress {
  totalProperties: number;
  processed: number;
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'running' | 'complete' | 'error';
  error?: string;
}

export function BatchInsightsButton() {
  const [progress, setProgress] = useState<BatchRescoreProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; hasInsight: number; missing: number } | null>(null);
  const queryClient = useQueryClient();

  const fetchStats = useCallback(async () => {
    try {
      const { count: total } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true });
      
      const { count: hasInsight } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .not("snap_insight", "is", null);
      
      const totalCount = total ?? 0;
      const insightCount = hasInsight ?? 0;
      setStats({ 
        total: totalCount, 
        hasInsight: insightCount, 
        missing: totalCount - insightCount 
      });
    } catch (error) {
      console.error("Failed to fetch insight stats:", error);
    }
  }, []);

  // Auto-fetch stats on mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchStats();
    setIsLoading(false);
    toast.success("Stats refreshed");
  };

  const handleGenerateInsights = async () => {
    try {
      setIsLoading(true);
      toast.info("Starting server-side insight generation...");

      // Call the bulk-generate-missing-insights edge function
      const { data, error } = await supabase.functions.invoke("bulk-generate-missing-insights", {
        body: { offset: 0, autoResume: true }
      });
      
      if (error) throw error;

      if (data.success) {
        if (data.auto_continuing) {
          toast.success(`Started! Processing ${data.progress?.total?.toLocaleString()} properties. This runs server-side and will continue automatically.`);
          setProgress({
            totalProperties: data.progress?.total ?? stats?.total ?? 0,
            processed: data.processed ?? 0,
            currentBatch: 1,
            totalBatches: Math.ceil((data.progress?.total ?? 0) / 200),
            status: 'running',
          });
        } else {
          toast.success(`Generated insights for ${data.processed?.toLocaleString()} properties!`);
          setProgress({
            totalProperties: data.progress?.total ?? 0,
            processed: data.progress?.total ?? 0,
            currentBatch: 1,
            totalBatches: 1,
            status: 'complete',
          });
        }
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ["opportunity-funnel"] });
        queryClient.invalidateQueries({ queryKey: ["hot-properties"] });
        queryClient.invalidateQueries({ queryKey: ["jurisdiction-stats"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        // Refresh stats after a delay
        setTimeout(fetchStats, 2000);
      }
    } catch (error) {
      console.error("Insight generation failed:", error);
      toast.error("Insight generation failed: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const progressPercent = progress 
    ? Math.round((progress.processed / progress.totalProperties) * 100) 
    : 0;

  return (
    <Card className="border-amber-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Generate Missing Insights
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          Process properties that don't have SNAP insights yet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats === null ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : stats.missing === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            All properties have insights!
          </div>
        ) : (
          <>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total properties:</span>
                <span className="font-semibold">{stats.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Have insights:</span>
                <span className="font-semibold text-green-600">{stats.hasInsight.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Missing insights:</span>
                <span className="font-semibold text-amber-500">{stats.missing.toLocaleString()}</span>
              </div>
              <Progress value={(stats.hasInsight / stats.total) * 100} className="h-2 mt-2" />
              <div className="text-xs text-muted-foreground text-center">
                {Math.round((stats.hasInsight / stats.total) * 100)}% have insights
              </div>
            </div>

            {progress?.status === 'running' && (
              <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Processing in background...</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Batch {progress.currentBatch} of {progress.totalBatches}</span>
                  <span>{progress.processed.toLocaleString()} / {progress.totalProperties.toLocaleString()}</span>
                </div>
              </div>
            )}

            {progress?.status === 'complete' && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                Complete! Generated insights for {progress.processed.toLocaleString()} properties.
              </div>
            )}

            {progress?.status === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error: {progress.error}
              </div>
            )}

            <Button 
              onClick={handleGenerateInsights} 
              disabled={isLoading || progress?.status === 'running'}
              className="w-full bg-amber-500 hover:bg-amber-600"
            >
              {progress?.status === 'running' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating... {progressPercent}%
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Generate All Missing Insights
                </>
              )}
            </Button>
            
            <p className="text-xs text-muted-foreground">
              ⚠️ This will process {stats.missing.toLocaleString()} properties in batches. 
              Processing happens server-side and continues automatically.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
