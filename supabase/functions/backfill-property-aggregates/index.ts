/**
 * Backfill Property Aggregates
 *
 * Recalculates violation aggregates for existing properties:
 * - total_violations
 * - open_violations
 * - violation_types
 * - repeat_offender
 * - last_enforcement_date
 *
 * Processes in batches to avoid timeout.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackfillRequest {
  batchSize?: number;  // Default: 100
  startOffset?: number; // For resuming
  cityFilter?: string;  // Optional: only backfill specific city
  stateFilter?: string; // Optional: only backfill specific state
  dryRun?: boolean;     // Preview only, don't update
}

interface BackfillResult {
  success: boolean;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  samples?: Array<{
    property_id: string;
    address: string;
    before: any;
    after: any;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      batchSize = 100,
      startOffset = 0,
      cityFilter,
      stateFilter,
      dryRun = false
    }: BackfillRequest = await req.json().catch(() => ({}));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build query for properties to process
    let query = supabase
      .from("properties")
      .select("id, address, city, state, total_violations, open_violations, violation_types, repeat_offender, last_enforcement_date", { count: "exact" });

    if (cityFilter) {
      query = query.ilike("city", cityFilter);
    }
    if (stateFilter) {
      query = query.ilike("state", stateFilter);
    }

    // Get total count first
    const { count: totalCount, error: countError } = await query;

    if (countError) {
      console.error("[backfill] Error counting properties:", countError);
      throw countError;
    }

    console.log(`[backfill] Total properties to process: ${totalCount}`);
    console.log(`[backfill] Batch size: ${batchSize}`);
    console.log(`[backfill] Start offset: ${startOffset}`);
    console.log(`[backfill] Dry run: ${dryRun}`);

    // Fetch batch of properties
    const { data: properties, error: fetchError } = await query
      .range(startOffset, startOffset + batchSize - 1);

    if (fetchError) {
      console.error("[backfill] Error fetching properties:", fetchError);
      throw fetchError;
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: "No properties to process in this batch"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[backfill] Processing ${properties.length} properties...`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const samples: any[] = [];

    // Process each property
    for (const property of properties) {
      try {
        // Fetch all violations for this property
        const { data: violations, error: violError } = await supabase
          .from("violations")
          .select("violation_type, status, opened_date, case_id")
          .eq("property_id", property.id);

        if (violError) {
          console.error(`[backfill] Error fetching violations for ${property.id}:`, violError);
          errors++;
          continue;
        }

        // Skip if no violations
        if (!violations || violations.length === 0) {
          skipped++;
          continue;
        }

        // Calculate aggregates
        const totalCount = violations.length;

        const openCount = violations.filter(v =>
          (v.status || '').toLowerCase().trim() === 'open'
        ).length;

        const types = [...new Set(
          violations
            .map(v => v.violation_type)
            .filter((t): t is string => t !== null && t.trim() !== '')
        )];

        const uniqueCases = new Set(
          violations
            .map(v => v.case_id)
            .filter((c): c is string => c !== null && c.trim() !== '')
        );
        const isRepeatOffender = uniqueCases.size > 1;

        const dates = violations
          .map(v => v.opened_date)
          .filter((d): d is string => d !== null)
          .map(d => new Date(d))
          .filter(d => !isNaN(d.getTime()));

        const lastEnforcementDate = dates.length > 0
          ? new Date(Math.max(...dates.map(d => d.getTime()))).toISOString()
          : null;

        const aggregates = {
          total_violations: totalCount,
          open_violations: openCount,
          violation_types: types,
          repeat_offender: isRepeatOffender,
          last_enforcement_date: lastEnforcementDate,
        };

        // Store sample for first 5 properties
        if (samples.length < 5) {
          samples.push({
            property_id: property.id,
            address: property.address,
            before: {
              total_violations: property.total_violations,
              open_violations: property.open_violations,
              violation_types: property.violation_types,
              repeat_offender: property.repeat_offender,
              last_enforcement_date: property.last_enforcement_date,
            },
            after: aggregates
          });
        }

        // Update property (unless dry run)
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from("properties")
            .update({
              total_violations: aggregates.total_violations,
              open_violations: aggregates.open_violations,
              violation_types: aggregates.violation_types,
              repeat_offender: aggregates.repeat_offender,
              last_enforcement_date: aggregates.last_enforcement_date,
              updated_at: new Date().toISOString(),
            })
            .eq("id", property.id);

          if (updateError) {
            console.error(`[backfill] Error updating ${property.id}:`, updateError);
            errors++;
            continue;
          }
        }

        updated++;

      } catch (error) {
        console.error(`[backfill] Error processing property ${property.id}:`, error);
        errors++;
      }
    }

    const processed = properties.length;
    const progress = {
      current: startOffset + processed,
      total: totalCount || 0,
      percentage: totalCount ? Math.round(((startOffset + processed) / totalCount) * 100) : 100
    };

    console.log(`[backfill] ========================================`);
    console.log(`[backfill] Batch complete:`);
    console.log(`[backfill]   Processed: ${processed}`);
    console.log(`[backfill]   Updated: ${updated}`);
    console.log(`[backfill]   Skipped (no violations): ${skipped}`);
    console.log(`[backfill]   Errors: ${errors}`);
    console.log(`[backfill]   Progress: ${progress.percentage}% (${progress.current}/${progress.total})`);
    console.log(`[backfill] ========================================`);

    const result: BackfillResult = {
      success: true,
      processed,
      updated,
      skipped,
      errors,
      progress,
      samples: dryRun ? samples : undefined,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[backfill] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
