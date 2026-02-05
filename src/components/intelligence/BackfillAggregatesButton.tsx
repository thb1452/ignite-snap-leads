 import { useState } from "react";
 import { Button } from "@/components/ui/button";
 import { Progress } from "@/components/ui/progress";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { RefreshCw, CheckCircle, AlertCircle, Database } from "lucide-react";
 import { toast } from "sonner";
 import { callFn } from "@/integrations/http/functions";
 import { supabase } from "@/integrations/supabase/client";
 
 interface BackfillProgress {
   processed: number;
   updated: number;
   skipped: number;
   errors: number;
   progress: {
     current: number;
     total: number;
     percentage: number;
   };
 }
 
 export function BackfillAggregatesButton() {
   const [progress, setProgress] = useState<BackfillProgress | null>(null);
   const [isLoading, setIsLoading] = useState(false);
   const [staleCount, setStaleCount] = useState<number | null>(null);
   const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
 
   const handleCheckStale = async () => {
     try {
       setIsLoading(true);
       // Count properties with total_violations = 0 but have actual violations
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
       toast.info("Starting property aggregate backfill...");
 
       const result = await callFn("backfill-property-aggregates", {
         batchSize: 200,
         startOffset: 0,
         onlyStale: true,
         autoResume: true,
       });
 
       if (result.success) {
         setProgress(result as BackfillProgress);
         
         if (result.autoResuming) {
           toast.success(`Started! Processing ${result.progress?.total?.toLocaleString()} properties. Runs server-side automatically.`);
           setStatus('running');
         } else if (result.processed === 0) {
           toast.success("No stale properties to backfill!");
           setStatus('complete');
           setStaleCount(0);
         } else {
           toast.success(`Backfill complete! Updated ${result.updated} properties.`);
           setStatus('complete');
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
 
   return (
     <Card className="border-primary/20">
       <CardHeader className="pb-3">
         <CardTitle className="text-lg flex items-center gap-2">
           <Database className="h-5 w-5 text-primary" />
           Backfill Property Aggregates
         </CardTitle>
         <CardDescription>
           Sync violation counts & tags for properties with stale data
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
                 <span className={`font-semibold ${staleCount > 0 ? 'text-amber-500' : 'text-green-600'}`}>
                   {staleCount.toLocaleString()}
                 </span>
               </div>
             </div>
 
             {status === 'running' && progress && (
               <div className="space-y-2">
                 <Progress value={progressPercent} className="h-2" />
                 <div className="flex justify-between text-xs text-muted-foreground">
                   <span>Processed: {progress.processed.toLocaleString()}</span>
                   <span>{progressPercent}%</span>
                 </div>
               </div>
             )}
 
             {status === 'complete' && (
               <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                 <CheckCircle className="h-4 w-4" />
                 Backfill complete! Updated {progress?.updated?.toLocaleString() ?? 0} properties.
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
               disabled={isLoading || status === 'running' || staleCount === 0}
               className="w-full"
               variant={staleCount > 0 ? "default" : "secondary"}
             >
               {status === 'running' ? (
                 <>
                   <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                   Running... {progressPercent}%
                 </>
               ) : (
                 <>
                   <Database className="h-4 w-4 mr-2" />
                   {staleCount > 0 ? `Backfill ${staleCount.toLocaleString()} Properties` : 'All Synced!'}
                 </>
               )}
             </Button>
           </>
         )}
       </CardContent>
     </Card>
   );
 }