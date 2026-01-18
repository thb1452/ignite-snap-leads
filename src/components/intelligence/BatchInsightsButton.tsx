import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Lightbulb } from "lucide-react";
import { 
  batchGenerateMissingInsights, 
  BatchRescoreProgress, 
  countPropertiesMissingInsights 
} from "@/services/batchRescore";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function BatchInsightsButton() {
  const [progress, setProgress] = useState<BatchRescoreProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; hasInsight: number; missing: number } | null>(null);
  const queryClient = useQueryClient();

  const handleFetchCount = async () => {
    try {
      setIsLoading(true);
      const { supabase } = await import("@/integrations/supabase/client");
      const { count: total } = await supabase.from("properties").select("id", { count: "exact", head: true });
      const { count: hasInsight } = await supabase.from("properties").select("id", { count: "exact", head: true }).not("snap_insight", "is", null);
      const totalCount = total ?? 0;
      const insightCount = hasInsight ?? 0;
      setStats({ 
        total: totalCount, 
        hasInsight: insightCount, 
        missing: totalCount - insightCount 
      });
    } catch (error) {
      toast.error("Failed to fetch count");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateInsights = async () => {
    try {
      setIsLoading(true);
      toast.info("Starting server-side insight generation...");

      // Call the bulk-rescore edge function which handles everything server-side
      const { callFn } = await import("@/integrations/http/functions");
      const result = await callFn("bulk-rescore", { offset: 0 });
      
      if (result.success) {
        if (result.auto_continuing) {
          toast.success(`Started! Processing ${result.progress?.total?.toLocaleString()} properties. This runs server-side and will continue automatically.`);
          setProgress({
            totalProperties: result.progress?.total ?? stats?.total ?? 0,
            processed: result.processed ?? 0,
            currentBatch: 1,
            totalBatches: Math.ceil((result.progress?.total ?? 0) / 50),
            status: 'running',
          });
        } else {
          toast.success(`Generated insights for ${result.processed?.toLocaleString()} properties!`);
          setProgress({
            totalProperties: result.progress?.total ?? 0,
            processed: result.progress?.total ?? 0,
            currentBatch: 1,
            totalBatches: 1,
            status: 'complete',
          });
        }
        // Invalidate all intelligence queries
        queryClient.invalidateQueries({ queryKey: ["opportunity-funnel"] });
        queryClient.invalidateQueries({ queryKey: ["hot-properties"] });
        queryClient.invalidateQueries({ queryKey: ["jurisdiction-stats"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        // Update the stats
        if (stats) {
          setStats({ ...stats, hasInsight: stats.total, missing: 0 });
        }
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
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          Generate Missing Insights
        </CardTitle>
        <CardDescription>
          Process properties that don't have SNAP insights yet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats === null ? (
          <Button 
            onClick={handleFetchCount} 
            disabled={isLoading}
            variant="outline"
            className="w-full"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Lightbulb className="h-4 w-4 mr-2" />
            )}
            Check Insight Stats
          </Button>
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
              <div className="space-y-2">
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
              ⚠️ This will process {stats.missing.toLocaleString()} properties in batches of 100. 
              Estimated time: ~{Math.ceil(stats.missing / 100 * 3)} seconds.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
