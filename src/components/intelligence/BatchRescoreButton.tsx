import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Sparkles, AlertTriangle } from "lucide-react";
import { BatchRescoreProgress } from "@/services/batchRescore";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function BatchRescoreButton() {
  const [progress, setProgress] = useState<BatchRescoreProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [scoredCount, setScoredCount] = useState<number | null>(null);
  const [outdatedCount, setOutdatedCount] = useState<number | null>(null);
  const [refreshMode, setRefreshMode] = useState<'all' | 'outdated' | null>(null);
  const queryClient = useQueryClient();
   const [isPolling, setIsPolling] = useState(false);

   // Poll for progress updates when a job is running
   const checkProgress = useCallback(async () => {
     try {
        const { supabase } = await import("@/integrations/supabase/externalClient");
       const [totalRes, scoredRes] = await Promise.all([
         supabase.from("properties").select("id", { count: "exact", head: true }),
         supabase.from("properties").select("id", { count: "exact", head: true }).not("snap_score", "is", null)
       ]);
       
       if (!totalRes.error && !scoredRes.error) {
         const newTotal = totalRes.count ?? 0;
         const newScored = scoredRes.count ?? 0;
         
         setPropertyCount(newTotal);
         setScoredCount(newScored);
         
         // Update progress if we're tracking it
         if (progress?.status === 'running') {
           setProgress(prev => prev ? {
             ...prev,
             processed: newScored,
             currentBatch: Math.ceil(newScored / 50),
           } : null);
           
           // Check if complete
           if (newScored >= newTotal) {
             setProgress(prev => prev ? { ...prev, status: 'complete' } : null);
             setIsPolling(false);
             invalidateQueries();
           }
         }
       }
     } catch (error) {
       console.error("Error checking progress:", error);
     }
   }, [progress?.status]);
 
   // Start/stop polling based on job status
   useEffect(() => {
     let interval: NodeJS.Timeout | null = null;
     
     if (isPolling && progress?.status === 'running') {
       interval = setInterval(checkProgress, 5000); // Poll every 5 seconds
     }
     
     return () => {
       if (interval) clearInterval(interval);
     };
   }, [isPolling, progress?.status, checkProgress]);
 
  const handleFetchCount = async () => {
    try {
      setIsLoading(true);
      const { supabase } = await import("@/integrations/supabase/externalClient");
      
      // Use simpler, faster queries that won't timeout
      const [totalRes, scoredRes] = await Promise.all([
        supabase.from("properties").select("id", { count: "exact", head: true }),
        supabase.from("properties").select("id", { count: "exact", head: true }).not("snap_score", "is", null)
      ]);
      
      if (totalRes.error) throw totalRes.error;
      if (scoredRes.error) throw scoredRes.error;
      
      setPropertyCount(totalRes.count ?? 0);
      setScoredCount(scoredRes.count ?? 0);
      // Skip outdated count as it's too slow - just show basic counts
      setOutdatedCount(0);
    } catch (error) {
      console.error("Failed to fetch property count:", error);
      toast.error("Failed to fetch property count");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRescore = async () => {
    try {
      setIsLoading(true);
      setRefreshMode('all');
      toast.info("Starting server-side batch re-scoring...");

      // Call the bulk-rescore edge function which auto-continues on the server
      const { callFn } = await import("@/integrations/http/functions");
      const result = await callFn("bulk-rescore", { offset: 0 });
      
      if (result.success) {
        if (result.auto_continuing) {
          toast.success(`Started! Processing ${result.progress?.total?.toLocaleString()} properties. This runs server-side and will continue automatically.`);
          setProgress({
            totalProperties: result.progress?.total ?? propertyCount ?? 0,
            processed: result.processed ?? 0,
            currentBatch: 1,
            totalBatches: Math.ceil((result.progress?.total ?? 0) / 50),
            status: 'running',
          });
        } else {
          toast.success(`Re-scored ${result.processed} properties!`);
          setProgress({
            totalProperties: result.progress?.total ?? 0,
            processed: result.progress?.total ?? 0,
            currentBatch: 1,
            totalBatches: 1,
            status: 'complete',
          });
        }
        invalidateQueries();
         setIsPolling(true); // Start polling for updates
      }
    } catch (error) {
      console.error("Batch re-scoring failed:", error);
      toast.error("Batch re-scoring failed: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshOutdated = async () => {
    try {
      setIsLoading(true);
      setRefreshMode('outdated');
      toast.info("Starting server-side refresh of outdated insights...");

      // Call the server-side edge function which auto-continues
      const { callFn } = await import("@/integrations/http/functions");
      const result = await callFn("refresh-outdated-insights", { offset: 0, autoResume: true });
      
      if (result.success) {
        if (result.auto_continuing) {
          toast.success(`Started! Refreshing ${result.progress?.total?.toLocaleString()} properties. Runs server-side automatically.`);
          setProgress({
            totalProperties: result.progress?.total ?? outdatedCount ?? 0,
            processed: result.progress?.current ?? 0,
            currentBatch: Math.ceil((result.progress?.current ?? 0) / 50),
            totalBatches: Math.ceil((result.progress?.total ?? 0) / 50),
            status: 'running',
          });
        } else if (result.complete) {
          toast.success(`All outdated insights refreshed!`);
          setProgress({
            totalProperties: result.progress?.total ?? 0,
            processed: result.progress?.total ?? 0,
            currentBatch: 1,
            totalBatches: 1,
            status: 'complete',
          });
          setOutdatedCount(0);
        }
        // Don't invalidate queries while running - causes page refresh issues
         setIsPolling(true); // Start polling for updates
      }
    } catch (error) {
      console.error("Refresh outdated failed:", error);
      toast.error("Refresh failed: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["opportunity-funnel"] });
    queryClient.invalidateQueries({ queryKey: ["hot-properties"] });
    queryClient.invalidateQueries({ queryKey: ["jurisdiction-stats"] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  const progressPercent = progress 
    ? Math.round((progress.processed / progress.totalProperties) * 100) 
    : 0;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Intelligence Engine v2.0
        </CardTitle>
        <CardDescription>
          Re-score all properties with the new algorithm
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {propertyCount === null ? (
          <Button 
            onClick={handleFetchCount} 
            disabled={isLoading}
            variant="outline"
            className="w-full"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Check Property Count
          </Button>
        ) : (
          <>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total properties:</span>
                <span className="font-semibold">{propertyCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already scored:</span>
                <span className="font-semibold text-green-600">{scoredCount?.toLocaleString() ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Need scoring:</span>
                <span className="font-semibold text-amber-500">{((propertyCount ?? 0) - (scoredCount ?? 0)).toLocaleString()}</span>
              </div>
              {outdatedCount !== null && outdatedCount > 0 && (
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                    Outdated language:
                  </span>
                  <span className="font-semibold text-orange-500">{outdatedCount.toLocaleString()}</span>
                </div>
              )}
              <Progress value={((scoredCount ?? 0) / (propertyCount ?? 1)) * 100} className="h-2 mt-2" />
              <div className="text-xs text-muted-foreground text-center">
                {Math.round(((scoredCount ?? 0) / (propertyCount ?? 1)) * 100)}% scored
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
                {refreshMode === 'outdated' ? 'Insight refresh complete!' : 'Re-scoring complete!'} Processed {progress.processed.toLocaleString()} properties.
              </div>
            )}

            {progress?.status === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error: {progress.error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {outdatedCount !== null && outdatedCount > 0 && (
                <Button 
                  onClick={handleRefreshOutdated} 
                  disabled={isLoading || progress?.status === 'running'}
                  variant="secondary"
                  className="w-full"
                >
                  {refreshMode === 'outdated' && progress?.status === 'running' ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Refreshing... {progressPercent}%
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Refresh {outdatedCount.toLocaleString()} Outdated Insights
                    </>
                  )}
                </Button>
              )}
              
              <Button 
                onClick={handleRescore} 
                disabled={isLoading || progress?.status === 'running'}
                className="w-full"
              >
                {refreshMode === 'all' && progress?.status === 'running' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Re-Scoring... {progressPercent}%
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Re-Score All Properties
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
