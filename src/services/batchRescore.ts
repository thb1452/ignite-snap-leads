import { supabase } from "@/integrations/supabase/client";
import { callFn } from "@/integrations/http/functions";

const BATCH_SIZE = 100; // Properties per batch
const BATCH_DELAY_MS = 2000; // Delay between batches to avoid rate limits

export interface BatchRescoreProgress {
  totalProperties: number;
  processed: number;
  currentBatch: number;
  totalBatches: number;
  status: 'idle' | 'running' | 'complete' | 'error';
  error?: string;
}

export type ProgressCallback = (progress: BatchRescoreProgress) => void;

/**
 * Fetches all property IDs from the database
 */
export async function getAllPropertyIds(): Promise<string[]> {
  const allIds: string[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("properties")
      .select("id")
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error("Error fetching property IDs:", error);
      throw error;
    }

    if (data && data.length > 0) {
      allIds.push(...data.map(p => p.id));
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allIds;
}

/**
 * Re-scores all properties in batches with progress updates
 */
export async function batchRescoreAllProperties(
  onProgress?: ProgressCallback
): Promise<{ success: boolean; processed: number; total: number }> {
  // Get all property IDs
  const propertyIds = await getAllPropertyIds();
  
  if (propertyIds.length === 0) {
    return { success: true, processed: 0, total: 0 };
  }

  const totalBatches = Math.ceil(propertyIds.length / BATCH_SIZE);
  let processed = 0;

  const progress: BatchRescoreProgress = {
    totalProperties: propertyIds.length,
    processed: 0,
    currentBatch: 0,
    totalBatches,
    status: 'running',
  };

  onProgress?.(progress);

  try {
    for (let i = 0; i < propertyIds.length; i += BATCH_SIZE) {
      const batch = propertyIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      console.log(`[BatchRescore] Processing batch ${batchNumber}/${totalBatches} (${batch.length} properties)`);

      progress.currentBatch = batchNumber;
      onProgress?.(progress);

      try {
        const result = await callFn("generate-insights", { propertyIds: batch });
        processed += (result as any)?.processed ?? batch.length;
      } catch (batchError) {
        console.error(`[BatchRescore] Batch ${batchNumber} error:`, batchError);
        // Continue with next batch even if one fails
      }

      progress.processed = processed;
      onProgress?.(progress);

      // Delay between batches to avoid rate limits
      if (i + BATCH_SIZE < propertyIds.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    progress.status = 'complete';
    onProgress?.(progress);

    return { success: true, processed, total: propertyIds.length };
  } catch (error) {
    console.error("[BatchRescore] Error:", error);
    progress.status = 'error';
    progress.error = error instanceof Error ? error.message : 'Unknown error';
    onProgress?.(progress);
    throw error;
  }
}
