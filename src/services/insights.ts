import { callFn } from "@/integrations/http/functions";

export async function generateInsights(propertyIds: string[]): Promise<{ 
  success: boolean; 
  processed: number; 
  total: number 
}> {
  try {
    const BATCH_SIZE = 50; // Process in batches to avoid timeouts
    let totalProcessed = 0;

    for (let i = 0; i < propertyIds.length; i += BATCH_SIZE) {
      const batch = propertyIds.slice(i, i + BATCH_SIZE);
      console.log(`Generating insights for batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} properties)`);
      
      const result = await callFn("generate-insights", { propertyIds: batch });
      totalProcessed += (result as any)?.processed ?? 0;
    }

    return { 
      success: true, 
      processed: totalProcessed, 
      total: propertyIds.length 
    };
  } catch (error) {
    console.error("Error generating insights:", error);
    throw error;
  }
}
