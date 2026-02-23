import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface RescoreProgress {
  offset: number;
  total: number;
  processed: number;
  status: 'idle' | 'running' | 'complete' | 'error';
  error?: string;
}

export function BatchRescoreButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [scoredCount, setScoredCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<RescoreProgress | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  const handleFetchCount = async () => {
    try {
      setIsLoading(true);
      const { supabase } = await import("@/integrations/supabase/externalClient");
      const [totalRes, scoredRes] = await Promise.all([
        supabase.from("properties").select("id", { count: "exact", head: true }),
        supabase.from("properties").select("id", { count: "exact", head: true }).not("snap_score", "is", null)
      ]);
      if (totalRes.error) throw totalRes.error;
      if (scoredRes.error) throw scoredRes.error;
      setPropertyCount(totalRes.count ?? 0);
      setScoredCount(scoredRes.count ?? 0);
    } catch (error) {
      console.error("Failed to fetch property count:", error);
      toast.error("Failed to fetch property count");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRescore = useCallback(async () => {
    abortRef.current = false;
    setIsLoading(true);
    toast.info("Starting full rescore — the browser will drive each batch until done.");

    const { callFn } = await import("@/integrations/http/functions");
    let offset = 0;
    let totalProcessed = 0;
    let total = propertyCount ?? 0;
    let batchNum = 0;

    setProgress({ offset: 0, total, processed: 0, status: 'running' });

    try {
      while (!abortRef.current) {
        batchNum++;
        console.log(`[BatchRescore] Calling batch #${batchNum}, offset=${offset}`);

        const result = await callFn("bulk-rescore", { offset, mode: 'all' });

        if (!result.success) {
          throw new Error(result.error || "Batch failed");
        }

        totalProcessed += result.processed ?? 0;
        total = result.progress?.total ?? total;
        const nextOffset = offset + 500; // BATCH_SIZE in bulk-rescore
        const isComplete = result.progress?.complete ?? (nextOffset >= total);

        setProgress({
          offset: nextOffset,
          total,
          processed: Math.min(nextOffset, total),
          status: isComplete ? 'complete' : 'running',
        });

        if (isComplete) {
          toast.success(`Rescore complete! Processed ${total.toLocaleString()} properties.`);
          queryClient.invalidateQueries({ queryKey: ["properties"] });
          queryClient.invalidateQueries({ queryKey: ["opportunity-funnel"] });
          queryClient.invalidateQueries({ queryKey: ["hot-properties"] });
          queryClient.invalidateQueries({ queryKey: ["jurisdiction-stats"] });
          break;
        }

        offset = nextOffset;

        // Small pause between batches to let the UI breathe
        await new Promise(r => setTimeout(r, 1000));
      }

      if (abortRef.current) {
        toast.info("Rescore stopped by user.");
        setProgress(prev => prev ? { ...prev, status: 'idle' } : null);
      }
    } catch (error) {
      console.error("Batch rescore error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Rescore failed at offset ${offset}: ${msg}`);
      setProgress(prev => prev ? { ...prev, status: 'error', error: msg } : null);
    } finally {
      setIsLoading(false);
    }
  }, [propertyCount, queryClient]);

  const handleStop = () => {
    abortRef.current = true;
  };

  const pct = progress ? Math.round((progress.processed / Math.max(progress.total, 1)) * 100) : 0;

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
          <Button onClick={handleFetchCount} disabled={isLoading} variant="outline" className="w-full">
            {isLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
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
              <Progress value={((scoredCount ?? 0) / (propertyCount ?? 1)) * 100} className="h-2 mt-2" />
              <div className="text-xs text-muted-foreground text-center">
                {Math.round(((scoredCount ?? 0) / (propertyCount ?? 1)) * 100)}% scored
              </div>
            </div>

            {progress?.status === 'running' && (
              <div className="space-y-2">
                <Progress value={pct} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Offset {progress.offset.toLocaleString()}</span>
                  <span>{progress.processed.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)</span>
                </div>
              </div>
            )}

            {progress?.status === 'complete' && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                Re-scoring complete! All {progress.total.toLocaleString()} properties processed.
              </div>
            )}

            {progress?.status === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error at offset {progress.offset.toLocaleString()}: {progress.error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {progress?.status === 'running' ? (
                <Button onClick={handleStop} variant="destructive" className="w-full">
                  Stop Rescore
                </Button>
              ) : (
                <Button onClick={handleRescore} disabled={isLoading} className="w-full">
                  {isLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Re-Score All Properties
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
