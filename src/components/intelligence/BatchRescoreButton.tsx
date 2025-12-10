import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle, AlertCircle, Sparkles } from "lucide-react";
import { batchRescoreAllProperties, BatchRescoreProgress, getAllPropertyIds } from "@/services/batchRescore";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function BatchRescoreButton() {
  const [progress, setProgress] = useState<BatchRescoreProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const handleFetchCount = async () => {
    try {
      setIsLoading(true);
      const ids = await getAllPropertyIds();
      setPropertyCount(ids.length);
    } catch (error) {
      toast.error("Failed to fetch property count");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRescore = async () => {
    try {
      setIsLoading(true);
      toast.info("Starting batch re-scoring...");

      const result = await batchRescoreAllProperties((p) => {
        setProgress(p);
      });

      if (result.success) {
        toast.success(`Re-scored ${result.processed} properties!`);
        // Invalidate all intelligence queries
        queryClient.invalidateQueries({ queryKey: ["opportunity-funnel"] });
        queryClient.invalidateQueries({ queryKey: ["hot-properties"] });
        queryClient.invalidateQueries({ queryKey: ["jurisdiction-stats"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
      }
    } catch (error) {
      toast.error("Batch re-scoring failed");
    } finally {
      setIsLoading(false);
    }
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
            <div className="text-sm text-muted-foreground">
              Found <span className="font-semibold text-foreground">{propertyCount.toLocaleString()}</span> properties to re-score
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
                Re-scoring complete! Processed {progress.processed.toLocaleString()} properties.
              </div>
            )}

            {progress?.status === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Error: {progress.error}
              </div>
            )}

            <Button 
              onClick={handleRescore} 
              disabled={isLoading || progress?.status === 'running'}
              className="w-full"
            >
              {progress?.status === 'running' ? (
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
