import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Database, Zap } from "lucide-react";
import { toast } from "sonner";
import { callFn } from "@/integrations/http/functions";
import { supabase } from "@/integrations/supabase/client";

interface BackfillProgress {
  processed: number;
  updated: number;
  remaining: number;
  progress: {
    current: number;
    remaining: number;
    percentage: number;
  };
  autoResuming?: boolean;
  version?: string;
}

export function BackfillAggregatesButton() {
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [staleCount, setStaleCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');

  // Poll for progress while running
  useEffect(() => {
    if (status !== 'running') return;

    const pollProgress = async () => {
      try {
        const { count, error } = await supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("total_violations", 0);
        
        if (error) throw error;
        
        const remaining = count ?? 0;
        const initialCount = staleCount ?? remaining;
        const processed = initialCount - remaining;
        
        setProgress(prev => ({
          ...prev!,
          remaining,
          processed,
          progress: {
            current: processed,
            remaining,
            percentage: initialCount > 0 ? Math.round((processed / initialCount) * 100) : 100
          }
        }));

        // Check if complete
        if (remaining === 0) {
          setStatus('complete');
          toast.success("Backfill complete! All properties synced.");
        }
      } catch (error) {
        console.error("Poll error:", error);
      }
    };

    const interval = setInterval(pollProgress, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [status, staleCount]);

  const handleCheckStale = async () => {
    try {
      setIsLoading(true);
      const { count, error } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("total_violations", 0);
      
      if (error) throw error;
      setStaleCount(count ?? 0);
    } catch (error) {
      console.error("Failed to check stale count:", error);
      toast.error("Failed to check stale properties");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackfill = async () => {
    try {
      setIsLoading(true);
      setStatus('running');
      toast.info("Starting high-speed SQL backfill...");

      const result = await callFn("backfill-property-aggregates", {
        batchSize: 5000, // SQL can handle larger batches
        autoResume: true,
      });

      if (result.success) {
        setProgress(result as BackfillProgress);
        
        if (result.remaining === 0) {
          toast.success("Backfill complete! All properties synced.");
          setStatus('complete');
          setStaleCount(0);
        } else if (result.autoResuming) {
          toast.success(`Processing ${result.remaining.toLocaleString()} properties. Running server-side.`);
        }
      } else {
        throw new Error(result.error || "Backfill failed");
      }
    } catch (error) {
      console.error("Backfill failed:", error);
      toast.error("Backfill failed: " + (error instanceof Error ? error.message : "Unknown error"));
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const progressPercent = progress?.progress?.percentage ?? 0;
  const remaining = progress?.remaining ?? staleCount ?? 0;
  const processed = staleCount && remaining ? staleCount - remaining : 0;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Backfill Property Aggregates
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap className="h-3 w-3" /> SQL v2
          </span>
        </CardTitle>
        <CardDescription>
          High-speed sync of violation counts & tags (~100x faster)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {staleCount === null ? (
          <Button 
            onClick={handleCheckStale} 
            disabled={isLoading}
            variant="outline"
            className="w-full"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Check Stale Properties
          </Button>
        ) : (
          <>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Properties needing sync:</span>
                <span className={`font-semibold ${remaining > 0 ? 'text-amber-500' : 'text-green-600'}`}>
                  {remaining.toLocaleString()}
                </span>
              </div>
              {status === 'running' && processed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Processed so far:</span>
                  <span className="font-semibold text-green-600">
                    {processed.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {status === 'running' && (
              <div className="space-y-2">
                <Progress value={progressPercent} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Synced: {processed.toLocaleString()}</span>
                  <span>{progressPercent}%</span>
                </div>
              </div>
            )}

            {status === 'complete' && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                Backfill complete! All properties synced.
              </div>
            )}

            {status === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Backfill failed. Check logs for details.
              </div>
            )}

            <Button 
              onClick={handleBackfill} 
              disabled={isLoading || status === 'running' || remaining === 0}
              className="w-full"
              variant={remaining > 0 ? "default" : "secondary"}
            >
              {status === 'running' ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Running... {progressPercent}%
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  {remaining > 0 ? `Backfill ${remaining.toLocaleString()} Properties` : 'All Synced!'}
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
