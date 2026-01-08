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
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const handleFetchCount = async () => {
    try {
      setIsLoading(true);
      const count = await countPropertiesMissingInsights();
      setMissingCount(count);
    } catch (error) {
      toast.error("Failed to fetch count");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateInsights = async () => {
    try {
      setIsLoading(true);
      toast.info("Starting bulk insight generation...");

      const result = await batchGenerateMissingInsights((p) => {
        setProgress(p);
      });

      if (result.success) {
        toast.success(`Generated insights for ${result.processed.toLocaleString()} properties!`);
        // Invalidate all intelligence queries
        queryClient.invalidateQueries({ queryKey: ["opportunity-funnel"] });
        queryClient.invalidateQueries({ queryKey: ["hot-properties"] });
        queryClient.invalidateQueries({ queryKey: ["jurisdiction-stats"] });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        // Update the count
        setMissingCount(0);
      }
    } catch (error) {
      toast.error("Insight generation failed");
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
        {missingCount === null ? (
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
            Check Missing Insights
          </Button>
        ) : missingCount === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            All properties have insights!
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Found <span className="font-semibold text-amber-500">{missingCount.toLocaleString()}</span> properties missing insights
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
              ⚠️ This will process {missingCount.toLocaleString()} properties in batches of 100. 
              Estimated time: ~{Math.ceil(missingCount / 100 * 3)} seconds.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
