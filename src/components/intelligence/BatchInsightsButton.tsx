import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Lightbulb, Sparkles } from "lucide-react";
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
  mode?: 'missing' | 'ai_refresh';
}

export function BatchInsightsButton() {
  const [progress, setProgress] = useState<BatchRescoreProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; hasInsight: number; missing: number; highScore: number } | null>(null);
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

      const { count: highScore } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .gte("snap_score", 50);
      
      const totalCount = total ?? 0;
      const insightCount = hasInsight ?? 0;
      setStats({ 
        total: totalCount, 
        hasInsight: insightCount, 
        missing: totalCount - insightCount,
        highScore: highScore ?? 0,
      });
    } catch (error) {
      console.error("Failed to fetch insight stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchStats();
    setIsLoading(false);
    toast.success("Stats refreshed");
  };

  const invokeInsights = async (forceRefresh: boolean, minScore: number, mode: 'missing' | 'ai_refresh') => {
    try {
      setIsLoading(true);
      const label = forceRefresh
        ? `Regenerating AI insights for ${(stats?.highScore ?? 0).toLocaleString()} properties with score 50+...`
        : "Starting server-side insight generation...";
      toast.info(label);

      const { data, error } = await supabase.functions.invoke("bulk-generate-missing-insights", {
        body: { offset: 0, autoResume: true, forceRefresh, minScore }
      });
      
      if (error) throw error;

      if (data?.success) {
        const total = data.progress?.total ?? 0;
        if (data.auto_continuing || total > 0) {
          toast.success(
            forceRefresh
              ? `AI insight regeneration started! Processing ${total.toLocaleString()} properties. Running in the background.`
              : `Started! Processing ${total.toLocaleString()} properties. Continues server-side automatically.`
          );
          setProgress({
            totalProperties: total,
            processed: data.processed ?? 0,
            currentBatch: 1,
            totalBatches: Math.ceil(total / 200),
            status: 'running',
            mode,
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
        setTimeout(fetchStats, 3000);
      }
    } catch (error) {
      console.error("Insight generation failed:", error);
      toast.error("Insight generation failed: " + (error instanceof Error ? error.message : "Unknown error"));
      setProgress(prev => prev ? { ...prev, status: 'error' } : null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateMissing = () => invokeInsights(false, 0, 'missing');
  const handleAIRefresh = () => invokeInsights(true, 50, 'ai_refresh');

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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Score 50+ (AI eligible):</span>
                <span className="font-semibold text-cyan-600">{stats.highScore.toLocaleString()}</span>
              </div>
              <Progress value={(stats.hasInsight / stats.total) * 100} className="h-2 mt-2" />
              <div className="text-xs text-muted-foreground text-center">
                {Math.round((stats.hasInsight / stats.total) * 100)}% have insights
              </div>
            </div>

            {isRunning && (
              <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>
                    {progress?.mode === 'ai_refresh' 
                      ? '🤖 AI regenerating score 50+ properties...' 
                      : 'Processing missing insights...'}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Batch {progress?.currentBatch} of {progress?.totalBatches}</span>
                  <span>{progress?.processed.toLocaleString()} / {progress?.totalProperties.toLocaleString()}</span>
                </div>
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

            {/* AI Re-generate button — primary action for demo */}
            <Button 
              onClick={handleAIRefresh}
              disabled={isLoading || isRunning}
              className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
            >
              {isRunning && progress?.mode === 'ai_refresh' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  AI Generating... {progressPercent}%
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Insights for Top {stats.highScore.toLocaleString()} Properties (Score 50+)
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Overwrites existing insights with AI-generated summaries using Gemini Flash
            </p>

            {/* Generate missing button — secondary */}
            {stats.missing > 0 && (
              <>
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
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
