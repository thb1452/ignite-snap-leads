/**
 * Bulk Rescore - Server-side batch processing for all properties
 * 
 * Processes ALL properties with the new freshness boost scoring algorithm.
 * Runs entirely server-side - no browser connection needed.
 * 
 * Usage: Call once to start, it will process in chunks and self-continue.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 100; // Process 100 properties per invocation (smaller to avoid URL length limits)

interface ScoreComponents {
  volumeScore: number;
  severityScore: number;
  ageScore: number;
  multiDeptScore: number;
  escalationScore: number;
  vacancyScore: number;
  freshnessBoost: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const { offset = 0, dryRun = false } = await req.json().catch(() => ({}));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get total count for progress tracking
    const { count: totalCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true });

    console.log(`[bulk-rescore] Starting at offset ${offset}, total properties: ${totalCount}`);

    // Fetch batch of properties
    const { data: properties, error: fetchError } = await supabase
      .from("properties")
      .select("id, address, city, state")
      .range(offset, offset + BATCH_SIZE - 1)
      .order("id");

    if (fetchError) {
      throw fetchError;
    }

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All properties processed!",
          processed: offset,
          total: totalCount,
          complete: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const propertyIds = properties.map(p => p.id);
    console.log(`[bulk-rescore] Processing ${propertyIds.length} properties (${offset + 1} to ${offset + propertyIds.length})`);

    // Batch fetch all violations for these properties
    const { data: allViolations, error: violError } = await supabase
      .from("violations")
      .select("property_id, violation_type, status, opened_date, last_updated, case_id, description, raw_description")
      .in("property_id", propertyIds);

    if (violError) {
      throw violError;
    }

    // Group violations by property
    const violationsByProperty = new Map<string, any[]>();
    for (const v of allViolations || []) {
      if (!violationsByProperty.has(v.property_id)) {
        violationsByProperty.set(v.property_id, []);
      }
      violationsByProperty.get(v.property_id)!.push(v);
    }

    let updated = 0;
    let skipped = 0;
    const updates: any[] = [];

    // Process each property
    for (const property of properties) {
      const violations = violationsByProperty.get(property.id) || [];
      
      if (violations.length === 0) {
        skipped++;
        continue;
      }

      // Calculate new score with freshness boost
      const { score, signals, components, opportunityClass } = calculateSnapScore(violations);
      
      // Prepare update
      updates.push({
        id: property.id,
        snap_score: score,
        distress_signals: signals,
        opportunity_class: opportunityClass,
        total_violations: violations.length,
        open_violations: violations.filter(v => v.status?.toLowerCase() === 'open').length,
        updated_at: new Date().toISOString()
      });
    }

    // Batch update all properties
    if (!dryRun && updates.length > 0) {
      // Process updates in smaller chunks to avoid payload limits
      const CHUNK_SIZE = 100;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        
        for (const update of chunk) {
          const { error: updateError } = await supabase
            .from("properties")
            .update({
              snap_score: update.snap_score,
              distress_signals: update.distress_signals,
              opportunity_class: update.opportunity_class,
              total_violations: update.total_violations,
              open_violations: update.open_violations,
              updated_at: update.updated_at
            })
            .eq("id", update.id);

          if (updateError) {
            console.error(`[bulk-rescore] Error updating ${update.id}:`, updateError);
          } else {
            updated++;
          }
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const nextOffset = offset + BATCH_SIZE;
    const isComplete = nextOffset >= (totalCount || 0);
    const progress = Math.round((nextOffset / (totalCount || 1)) * 100);

    console.log(`[bulk-rescore] Batch complete: ${updated} updated, ${skipped} skipped in ${elapsed}ms`);
    console.log(`[bulk-rescore] Progress: ${progress}% (${nextOffset}/${totalCount})`);

    // Auto-continue: Fire and forget the next batch
    if (!isComplete && !dryRun) {
      // Schedule next batch asynchronously (don't await)
      const selfUrl = `${SUPABASE_URL}/functions/v1/bulk-rescore`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ offset: nextOffset }),
      }).catch(err => console.error('[bulk-rescore] Failed to trigger next batch:', err));
      
      console.log(`[bulk-rescore] Auto-triggered next batch at offset ${nextOffset}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: properties.length,
        updated,
        skipped,
        elapsed_ms: elapsed,
        progress: {
          current: nextOffset,
          total: totalCount,
          percentage: Math.min(100, progress),
          complete: isComplete
        },
        next_offset: isComplete ? null : nextOffset,
        auto_continuing: !isComplete && !dryRun
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[bulk-rescore] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Calculate SnapScore with freshness boost
 */
function calculateSnapScore(violations: any[]): {
  score: number;
  signals: string[];
  components: ScoreComponents;
  opportunityClass: string;
} {
  const signals: string[] = [];
  const components: ScoreComponents = {
    volumeScore: 0,
    severityScore: 0,
    ageScore: 0,
    multiDeptScore: 0,
    escalationScore: 0,
    vacancyScore: 0,
    freshnessBoost: 0,
  };

  // Filter to OPEN violations for active distress scoring
  const openViolations = violations.filter(v => 
    (v.status || '').toLowerCase().trim() === 'open'
  );

  const totalCount = violations.length;
  const openCount = openViolations.length;

  // 1. VOLUME SCORE (Max 25 points)
  if (openCount >= 5) {
    components.volumeScore = 25;
    signals.push('high_volume');
  } else if (openCount >= 3) {
    components.volumeScore = 15;
    signals.push('moderate_volume');
  } else if (openCount >= 1) {
    components.volumeScore = 8;
  }

  // 2. SEVERITY SCORE (Max 25 points)
  const severeTypes = ['structural', 'fire', 'electrical', 'plumbing', 'roof', 'foundation', 'condemned'];
  const hasSevere = violations.some(v => 
    severeTypes.some(t => (v.violation_type || '').toLowerCase().includes(t))
  );
  if (hasSevere) {
    components.severityScore = 25;
    signals.push('severe_violations');
  }

  // 3. AGE SCORE (Max 15 points) - How long violations have been open
  const now = new Date();
  const openDates = openViolations
    .map(v => v.opened_date ? new Date(v.opened_date) : null)
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()));

  if (openDates.length > 0) {
    const oldestOpen = new Date(Math.min(...openDates.map(d => d.getTime())));
    const daysOpen = Math.floor((now.getTime() - oldestOpen.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysOpen > 365) {
      components.ageScore = 15;
      signals.push('chronic_violations');
    } else if (daysOpen > 180) {
      components.ageScore = 10;
      signals.push('aged_violations');
    } else if (daysOpen > 90) {
      components.ageScore = 5;
    }
  }

  // 4. MULTI-DEPARTMENT (Max 10 points)
  const uniqueTypes = new Set(violations.map(v => v.violation_type).filter(Boolean));
  if (uniqueTypes.size >= 3) {
    components.multiDeptScore = 10;
    signals.push('multi_department');
  }

  // 5. ESCALATION (Max 10 points) - Multiple cases = repeat offender
  const uniqueCases = new Set(violations.map(v => v.case_id).filter(Boolean));
  if (uniqueCases.size > 1) {
    components.escalationScore = 10;
    signals.push('repeat_offender');
  }

  // 6. VACANCY INDICATORS (Max 15 points)
  const vacancyKeywords = ['vacant', 'abandoned', 'boarded', 'unoccupied', 'secured'];
  const hasVacancy = violations.some(v => {
    const desc = ((v.description || '') + ' ' + (v.raw_description || '')).toLowerCase();
    return vacancyKeywords.some(kw => desc.includes(kw));
  });
  if (hasVacancy) {
    components.vacancyScore = 15;
    signals.push('vacancy_indicator');
  }

  // 7. FRESHNESS BOOST (Max 40 points) - NEW! Recent enforcement = motivated seller NOW
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const hasViolationLast7Days = violations.some(v => {
    const violationDate = v.opened_date ? new Date(v.opened_date) : 
                          v.last_updated ? new Date(v.last_updated) : null;
    return violationDate && !isNaN(violationDate.getTime()) && violationDate >= sevenDaysAgo;
  });

  const hasViolationLast30Days = !hasViolationLast7Days && violations.some(v => {
    const violationDate = v.opened_date ? new Date(v.opened_date) : 
                          v.last_updated ? new Date(v.last_updated) : null;
    return violationDate && !isNaN(violationDate.getTime()) && violationDate >= thirtyDaysAgo && violationDate < sevenDaysAgo;
  });

  if (hasViolationLast7Days) {
    components.freshnessBoost = 40;
    signals.push('hot_enforcement');
  } else if (hasViolationLast30Days) {
    components.freshnessBoost = 20;
    signals.push('recent_enforcement');
  }

  // Calculate total score
  let score = 
    components.volumeScore +
    components.severityScore +
    components.ageScore +
    components.multiDeptScore +
    components.escalationScore +
    components.vacancyScore +
    components.freshnessBoost;

  // If no open violations, cap score
  if (openCount === 0) {
    score = Math.min(score, 20);
  }

  // Cap at 100
  score = Math.min(100, Math.max(0, score));

  // Determine opportunity class
  let opportunityClass = 'watch';
  if (score >= 70) {
    opportunityClass = 'distressed';
  } else if (score >= 40) {
    opportunityClass = 'value_add';
  }

  return { score, signals, components, opportunityClass };
}
