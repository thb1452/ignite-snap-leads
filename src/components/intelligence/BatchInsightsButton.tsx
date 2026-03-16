import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Lightbulb, Sparkles, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/externalClient";
import { callFn } from "@/integrations/http/functions";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface BatchRescoreProgress {
  totalProperties: number;
  processed: number;
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'running' | 'complete' | 'error';
  error?: string;
  mode?: 'missing' | 'ai_refresh' | 'recent_20d';
  sinceDays?: number;
  forceRefresh?: boolean;
  minScore?: number;
}

export function BatchInsightsButton() {
  const [progress, setProgress] = useState<BatchRescoreProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; hasInsight: number; missing: number; highScore: number; generic: number; staleNoAction: number } | null>(null);
  const queryClient = useQueryClient();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const { count: total } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true });
      
      const { count: hasInsight } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .not("snap_insight", "is", null);

      const { count: highScore } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .gte("snap_score", 50);

      // Count generic/template insights that need replacement
      const { count: genericCount } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .not("snap_insight", "is", null)
        .lt("snap_insight", "S") // short generic insights sort before "S"
        .or("snap_insight.like.Routine%,snap_insight.like.Minimal%,snap_insight.like.Standard%");

      // Count stale "No active enforcement actions" insights —
      // these properties may actually have violations but the insight
      // was generated when violation data wasn't available.
      const { count: staleNoActionCount } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("snap_insight", "No active enforcement actions currently on file.");

      const totalCount = total ?? 0;
      const insightCount = hasInsight ?? 0;
      setStats({
        total: totalCount,
        hasInsight: insightCount,
        missing: totalCount - insightCount,
        highScore: highScore ?? 0,
        generic: genericCount ?? 0,
        staleNoAction: staleNoActionCount ?? 0,
      });
    } catch (error) {
      console.error("Failed to fetch insight stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Poll stats every 8 seconds while running to reflect real progress
  useEffect(() => {
    if (progress?.status === 'running') {
      pollingRef.current = setInterval(async () => {
        await fetchStats();
        // Check if the target segment is fully processed
        setStats(prev => {
          if (prev && progress) {
            const remaining = prev.total - prev.hasInsight;
            const isDone =
              // missing mode: no more NULL insights
              (progress.mode === 'missing' && remaining === 0) ||
              // recent_20d / ai_refresh: hasInsight count stopped growing
              // (server-side auto-resume signals completion via autoResuming=false,
              //  but as a safety net we also complete when nothing is missing)
              (progress.mode === 'recent_20d' && remaining === 0) ||
              (progress.mode === 'ai_refresh' && remaining === 0);
            if (isDone) {
              setProgress(p => p ? { ...p, status: 'complete', processed: p.totalProperties } : p);
              if (pollingRef.current) clearInterval(pollingRef.current);
            }
          }
          return prev;
        });
      }, 8000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [progress?.status, fetchStats]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchStats();
    setIsLoading(false);
    toast.success("Stats refreshed");
  };

  const invokeInsights = async (
    forceRefresh: boolean,
    minScore: number,
    mode: 'missing' | 'ai_refresh' | 'recent_20d',
    sinceDays?: number
  ) => {
    try {
      setIsLoading(true);
      const label = sinceDays
        ? `Generating AI insights for last ${sinceDays} days of properties (score 50+)...`
        : forceRefresh
        ? `Regenerating AI insights for ${(stats?.highScore ?? 0).toLocaleString()} properties with score 50+...`
        : "Starting server-side insight generation...";
      toast.info(label);

      const body: Record<string, unknown> = { offset: 0, autoResume: true, forceRefresh, minScore };
      if (sinceDays) body.sinceDays = sinceDays;

      const data = await callFn("bulk-generate-missing-insights", body);
      const error = null;

      if (data?.success) {
        const total = data.progress?.total ?? 0;
        const batchesDone = Math.ceil((data.processed ?? 0) / 200);
        const totalBatches = Math.ceil(total / 200);

        if (data.auto_continuing || total > 0) {
          toast.success(
            sinceDays
              ? `AI insights running for last ${sinceDays} days! Processing ${total.toLocaleString()} properties in the background.`
              : forceRefresh
              ? `AI insight regeneration started! Processing ${total.toLocaleString()} properties. Running in the background.`
              : `Started! Processing ${total.toLocaleString()} properties. Continues server-side automatically.`
          );
          setProgress({
            totalProperties: total,
            processed: data.processed ?? 0,
            currentBatch: batchesDone || 1,
            totalBatches: totalBatches || 1,
            status: data.progress?.complete ? 'complete' : 'running',
            mode,
            sinceDays,
            forceRefresh,
            minScore,
          });
        } else {
          toast.success(`Generated insights for ${data.processed?.toLocaleString()} properties!`);
          setProgress({
            totalProperties: data.progress?.total ?? 0,
            processed: data.progress?.total ?? 0,
            currentBatch: 1,
            totalBatches: 1,
            status: 'complete',
            mode,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["opportunity-funnel"] });
        queryClient.invalidateQueries({ queryKey: ["hot-properties"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        setTimeout(fetchStats, 5000);
      }
    } catch (error) {
      console.error("Insight generation failed:", error);
      toast.error("Insight generation failed: " + (error instanceof Error ? error.message : "Unknown error"));
      setProgress(prev => prev ? { ...prev, status: 'error' } : null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRepairStaleNoAction = async () => {
    try {
      setIsLoading(true);
      // Step 1: Use the repair SQL function to reset stale insights to NULL
      // (only for properties that actually have violations in the violations table)
      const { error } = await supabase.rpc('repair_stale_no_action_insights', { p_dry_run: false });
      if (error) throw error;
      toast.info("Stale insights cleared. Generating replacements...");
      // Step 2: Now fill the newly-NULL insights
      invokeInsights(false, 0, 'missing');
    } catch (error) {
      console.error("Repair failed:", error);
      toast.error("Repair failed: " + (error instanceof Error ? error.message : "Unknown error"));
      setIsLoading(false);
    }
  };

  const handleGenerateMissing = () => invokeInsights(false, 0, 'missing');
  const handleAIRefresh = () => invokeInsights(true, 50, 'ai_refresh');
  const handleRecent20Days = () => invokeInsights(true, 50, 'recent_20d', 20);
  const handleReplaceAll = () => {
    const confirmed = window.confirm(
      `This will overwrite ALL ${(stats?.total ?? 0).toLocaleString()} insights — including any that are already correct.\n\nAre you sure you want to do a full rebuild?`
    );
    if (confirmed) invokeInsights(true, 0, 'ai_refresh');
  };

  const progressPercent = progress 
    ? Math.round((progress.processed / Math.max(progress.totalProperties, 1)) * 100) 
    : 0;

  const isRunning = progress?.status === 'running';

  return (
    <Card className="border-amber-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Insight Engine
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
          Generate or refresh AI insights for high-value properties
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats === null ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
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
              {stats.missing > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Missing insights:</span>
                  <span className="font-semibold text-amber-500">{stats.missing.toLocaleString()}</span>
                </div>
              )}
              {stats.generic > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">⚠️ Generic / template:</span>
                  <span className="font-semibold text-red-500">{stats.generic.toLocaleString()}</span>
                </div>
              )}
              {stats.staleNoAction > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">🚨 Stale "no action" insight:</span>
                  <span className="font-semibold text-red-600">{stats.staleNoAction.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Score 50+ (AI eligible):</span>
                <span className="font-semibold text-cyan-600">{stats.highScore.toLocaleString()}</span>
              </div>
              {(() => {
                const qualityCount = stats.hasInsight - stats.generic;
                const qualityPct = stats.total > 0 ? Math.round((qualityCount / stats.total) * 100) : 0;
                return (
                  <>
                    <Progress value={qualityPct} className="h-2 mt-2" />
                    <div className="text-xs text-muted-foreground text-center">
                      {qualityPct}% have quality insights ({stats.generic > 0 ? `${stats.generic.toLocaleString()} need replacement` : 'all good'})
                    </div>
                  </>
                );
              })()}
            </div>

            {isRunning && (
              <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>
                    {progress?.mode === 'ai_refresh'
                      ? '🤖 AI regenerating score 50+ properties...'
                      : progress?.mode === 'recent_20d'
                      ? '🤖 AI generating insights (last 20 days)...'
                      : 'Processing missing insights...'}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Running in background — refreshing every 8s</span>
                  <span>{(stats?.hasInsight ?? 0).toLocaleString()} / {(stats?.total ?? 0).toLocaleString()} have insights</span>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  ✓ Processing continues even if you navigate away
                </p>
              </div>
            )}

            {progress?.status === 'complete' && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                Complete! Processed {progress.processed.toLocaleString()} properties.
              </div>
            )}

            {progress?.status === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error during generation. Check logs.
              </div>
            )}

            {/* PRIMARY: Replace ALL insights across entire database */}
            <Button 
              onClick={handleReplaceAll}
              disabled={isLoading || isRunning}
              className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white"
              size="lg"
            >
              {isRunning && progress?.mode === 'ai_refresh' && progress?.minScore === 0 ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Replacing All Insights... {progressPercent}%
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  🔥 Replace ALL {stats.total.toLocaleString()} Insights (Full Rebuild)
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Overwrites every single insight — generic templates, old text, everything. Uses AI for score 50+ and rule-based for the rest.
            </p>

            {/* SECONDARY: Last 20 Days AI Insights */}
            <Button 
              onClick={handleRecent20Days}
              disabled={isLoading || isRunning}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
            >
              {isRunning && progress?.mode === 'recent_20d' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  AI Generating Last 20 Days... {progressPercent}%
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4 mr-2" />
                  🤖 AI Insights — Last 20 Days (Score 50+)
                </>
              )}
            </Button>

            {/* AI Re-generate button — score 50+ only */}
            <Button 
              onClick={handleAIRefresh}
              disabled={isLoading || isRunning}
              variant="outline"
              className="w-full"
            >
              {isRunning && progress?.mode === 'ai_refresh' && (progress?.minScore ?? 50) >= 50 ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  AI Generating All... {progressPercent}%
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Insights — Only {stats.highScore.toLocaleString()} Properties (Score 50+)
                </>
              )}
            </Button>

            {/* Repair stale "No active enforcement actions" insights */}
            {stats.staleNoAction > 0 && (
              <Button
                onClick={handleRepairStaleNoAction}
                disabled={isLoading || isRunning}
                variant="destructive"
                className="w-full"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <AlertCircle className="h-4 w-4 mr-2" />
                )}
                🚨 Repair {stats.staleNoAction.toLocaleString()} Stale "No Action" Insights
              </Button>
            )}

            {/* Generate missing button — secondary */}
            {stats.missing > 0 && (
              <Button
                onClick={handleGenerateMissing}
                disabled={isLoading || isRunning}
                variant="outline"
                className="w-full"
              >
                {isRunning && progress?.mode === 'missing' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating... {progressPercent}%
                  </>
                ) : (
                  <>
                    <Lightbulb className="h-4 w-4 mr-2" />
                    Fill {stats.missing.toLocaleString()} Missing Insights (Rule-based)
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
