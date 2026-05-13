/**
 * SNAP INSIGHT GENERATION v9.4 - AZURE GPT-4o MINI + PUNCHY SCOUT BRIEF
 * 
 * Properties with snap_score >= 20: AI-generated wholesaler distress brief
 *   - Uses Azure OpenAI GPT-4o mini
 *   - Field intelligence / scout voice with signal stacks
 *   - Falls back to deterministic engine if Azure unavailable
 * 
 * Properties with snap_score < 20 (or AI unavailable): deterministic engine
 *   - Fact → Signal → Action Label format
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sanitizeInsightForStorage } from "../_shared/insightSanitizer.ts";
import { DEAL_STRATEGIST_PROMPT, formatPropertyForPrompt } from "../_shared/dealStrategistPrompt.ts";
import {
  type Violation,
  type ViolationWithPriority,
  type SnapScoreResult,
  type PropertyIntelligence,
  aggregatePropertyIntelligence,
  calculateEnforcementIntensity,
  classifyViolation,
} from "../_shared/enforcementScoring.ts";

const VERSION = "v9.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SNAP_SCORE_AI_THRESHOLD = 20;

// Scoring types + functions are imported from ../_shared/enforcementScoring.ts
// (canonical SnapScore v7.1 algorithm — do not redefine here).

// ============================================================================
// DETERMINISTIC INSIGHT BLOCKS
// ============================================================================
const INSIGHT_BLOCKS = {
  PRIORITY_WATER_SHUTOFF: "Municipal water service disconnected — direct enforcement action taken by the utility authority.",
  PRIORITY_WATER_SHUTOFF_WITH_VIOLATIONS: "Water service disconnected with concurrent open code violations — multiple enforcement bodies actively engaged.",
  PRIORITY_CONDEMNATION: "Condemnation or unsafe structure orders documented.",
  PRIORITY_LEGAL: "Case referred for legal enforcement action.",
  PRIORITY_FIRE_MARSHAL: "Fire marshal orders or fire safety citations on file.",
} as const;

// ============================================================================
// AI INSIGHT GENERATION — v7.1 improvements:
//   - max_tokens 300, temperature 0.5
//   - 12 violations passed, severity counts in prompt
//   - oldest_violation_days in prompt
// ============================================================================
async function generateAIInsight(
  property: { address: string; city: string; state?: string; zip?: string; enforcement_type?: string },
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence,
  scoreResult: SnapScoreResult,
  azureConfig: { endpoint: string; apiKey: string; deployment: string }
): Promise<string | null> {
  try {
    const isWaterShutoff = property.enforcement_type === 'water_shutoff';
    const hasFireCitation = scoreResult.signals.some(s => s.includes('fire'));
    const isEscalated = intelligence.escalated;

    // Signal context (no emojis in prompt)

    // Determine action label
    let actionLabel = 'WATCH';
    if (isEscalated || isWaterShutoff || hasFireCitation || (scoreResult.score >= 90 && intelligence.open_violations >= 4)) {
      actionLabel = 'CALL NOW';
    } else if (scoreResult.score >= 70 || (intelligence.open_violations >= 2 && intelligence.open_violations <= 3) || intelligence.repeat_offender || intelligence.multi_department) {
      actionLabel = 'WORTH A CALL';
    }

    const violationTypes = intelligence.violation_types.length > 0 ? intelligence.violation_types.join(', ') : '';
    const inputLines = [
      `Location: ${property.city}${property.state ? `, ${property.state}` : ''}${property.zip ? ` ${property.zip}` : ''}`,
      `SnapScore: ${scoreResult.score}/100`,
      `Class: ${scoreResult.activityClass === 'critical' ? 'distressed' : scoreResult.activityClass === 'elevated' ? 'value_add' : 'watch'}`,
      `Open/Total Violations: ${intelligence.open_violations}/${intelligence.total_violations}`,
      violationTypes ? `Types: ${violationTypes}` : '',
      intelligence.avg_days_open ? `Avg Days Open: ${intelligence.avg_days_open}` : '',
      intelligence.oldest_violation_date ? `Oldest Violation: ${intelligence.oldest_violation_date}` : '',
      intelligence.newest_violation_date ? `Newest Activity: ${intelligence.newest_violation_date}` : '',
      `Escalated: ${intelligence.escalated}`,
      `Repeat Offender: ${intelligence.repeat_offender}`,
      `Multi-Department: ${intelligence.multi_department}`,
      property.enforcement_type ? `Water Shutoff: ${property.enforcement_type}` : '',
      scoreResult.signals.length ? `Distress Signals: ${scoreResult.signals.join(', ')}` : '',
    ].filter(Boolean);

    const systemPrompt = DEAL_STRATEGIST_PROMPT;

    const userPrompt = `PROPERTY DATA:
${inputLines.join('\n')}

Write the investor insight now:`;

    const azureUrl = `${azureConfig.endpoint.replace(/\/+$/, '')}/openai/deployments/${azureConfig.deployment}/chat/completions?api-version=2024-08-01-preview`;

    // Retry with exponential backoff on 429 and 5xx (3 attempts: 1s, 2s, 4s)
    const RETRY_DELAYS_MS = [1000, 2000, 4000];
    let response: Response | null = null;
    let lastErrBody = '';
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      response = await fetch(azureUrl, {
        method: 'POST',
        headers: {
          'api-key': azureConfig.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_completion_tokens: 400,
          temperature: 0.4,
        }),
      });

      if (response.ok) break;

      const isRetryable = response.status === 429 || response.status >= 500;
      if (!isRetryable) {
        lastErrBody = await response.text().catch(() => '');
        console.error(`[generate-insights ${VERSION}] Azure error ${response.status}: ${lastErrBody}`);
        return null;
      }

      lastErrBody = await response.text().catch(() => '');
      const delay = RETRY_DELAYS_MS[attempt];
      const isLast = attempt === RETRY_DELAYS_MS.length - 1;
      console.warn(`[generate-insights ${VERSION}] Azure ${response.status} (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})${isLast ? ' — giving up' : ` — retrying in ${delay}ms`}`);
      if (isLast) return null;
      await new Promise((r) => setTimeout(r, delay));
    }

    if (!response || !response.ok) return null;

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 10) return null;

    return sanitizeInsightForStorage(text, actionLabel);
  } catch (err) {
    console.error(`[generate-insights ${VERSION}] Azure AI error:`, err);
    return null;
  }
}

serve(async (req) => {
  console.log(`[generate-insights ${VERSION}] Request received`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { propertyIds, aiOnly = false } = await req.json();
    
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "propertyIds array is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const AZURE_OPENAI_API_KEY = Deno.env.get("AZURE_OPENAI_API_KEY");
    const AZURE_OPENAI_ENDPOINT = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get("AZURE_OPENAI_DEPLOYMENT");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const azureConfig = (AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_DEPLOYMENT)
      ? { apiKey: AZURE_OPENAI_API_KEY, endpoint: AZURE_OPENAI_ENDPOINT, deployment: AZURE_OPENAI_DEPLOYMENT }
      : null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Chunk IDs to avoid PostgREST URL length limits (max ~50 UUIDs per query)
    const CHUNK_SIZE = 40;
    const allProperties: any[] = [];
    for (let i = 0; i < propertyIds.length; i += CHUNK_SIZE) {
      const chunk = propertyIds.slice(i, i + CHUNK_SIZE);
      const { data, error: fetchError } = await supabase
        .from("properties")
        .select(`
          id,
          address,
          city,
          state,
          zip,
          snap_score,
          jurisdiction_id,
          enforcement_type,
          escalated,
          violations (
            id,
            violation_type,
            status,
            days_open,
            opened_date,
            raw_description,
            last_updated
          )
        `)
        .in("id", chunk);

      if (fetchError) {
        console.error(`[generate-insights ${VERSION}] Error fetching chunk ${i / CHUNK_SIZE + 1}:`, fetchError);
        throw fetchError;
      }
      if (data) allProperties.push(...data);
    }
    const properties = allProperties;

    if (!properties || properties.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, processed: 0, total: propertyIds.length,
          message: "No properties found to process", _version: VERSION
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-insights ${VERSION}] Processing ${properties.length} properties`);

    const updates = [];
    let successCount = 0;
    let errorCount = 0;
    let aiGeneratedCount = 0;
    let deterministicCount = 0;
    let aiCreditsExhausted = false;
    let aiCallCount = 0;

    const throttleAI = async () => {
      aiCallCount++;
      if (aiCallCount > 1) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    };

    for (const property of properties) {
      const violations = (property.violations || []) as Violation[];
      
      if ((property as any).enforcement_type === 'water_shutoff') {
        (violations as any).__enforcement_type = 'water_shutoff';
      }
      
      const classifiedViolations = violations.map(v => classifyViolation(v));
      const intelligence = aggregatePropertyIntelligence(violations, classifiedViolations, (property as any).escalated);
      const scoreResult = calculateEnforcementIntensity(violations, classifiedViolations, intelligence);

      let snapInsight: string;
      let method: 'ai' | 'deterministic' = 'deterministic';

      const effectiveScore = Math.max(property.snap_score ?? 0, scoreResult.score);
      const shouldUseAI = azureConfig && !aiCreditsExhausted && effectiveScore >= SNAP_SCORE_AI_THRESHOLD;

      if (shouldUseAI) {
        await throttleAI();
        const aiInsight = await generateAIInsight(
          { address: property.address, city: property.city, state: (property as any).state, zip: (property as any).zip, enforcement_type: (property as any).enforcement_type },
          violations, classifiedViolations, intelligence, scoreResult, azureConfig
        );

        if (aiInsight === null) {
          aiCreditsExhausted = true;
          if (aiOnly) {
            // AI-only mode: skip this property entirely, don't fall back
            console.log(`[generate-insights ${VERSION}] AI credits exhausted, skipping property (aiOnly mode)`);
            continue;
          }
          snapInsight = composeEnforcementInsight(scoreResult.signals, intelligence, classifiedViolations, effectiveScore);
          deterministicCount++;
        } else {
          snapInsight = aiInsight;
          aiGeneratedCount++;
          method = 'ai';
        }
      } else if (aiOnly) {
        // AI-only mode: skip properties that don't qualify for AI
        if (aiCreditsExhausted) {
          console.log(`[generate-insights ${VERSION}] AI credits exhausted, skipping remaining (aiOnly mode)`);
          break;
        }
        continue;
      } else {
        snapInsight = composeEnforcementInsight(scoreResult.signals, intelligence, classifiedViolations, effectiveScore);
        deterministicCount++;
      }

      const opportunityClass = scoreResult.activityClass === 'critical' ? 'distressed' :
                               scoreResult.activityClass === 'elevated' ? 'value_add' : 'watch';

      updates.push({
        id: property.id,
        snap_insight: snapInsight,
        snap_score: scoreResult.score,
        total_violations: intelligence.total_violations,
        open_violations: intelligence.open_violations,
        oldest_violation_date: intelligence.oldest_violation_date,
        newest_violation_date: intelligence.newest_violation_date,
        avg_days_open: intelligence.avg_days_open,
        violation_types: intelligence.violation_types,
        repeat_offender: intelligence.repeat_offender,
        multi_department: intelligence.multi_department,
        escalated: intelligence.escalated,
        distress_signals: scoreResult.signals,
        opportunity_class: opportunityClass,
        last_analyzed_at: new Date().toISOString(),
      });
    }

    // Batch update
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("properties")
        .update({
          snap_insight: update.snap_insight,
          snap_score: update.snap_score,
          total_violations: update.total_violations,
          open_violations: update.open_violations,
          oldest_violation_date: update.oldest_violation_date,
          newest_violation_date: update.newest_violation_date,
          avg_days_open: update.avg_days_open,
          violation_types: update.violation_types,
          repeat_offender: update.repeat_offender,
          multi_department: update.multi_department,
          escalated: update.escalated,
          distress_signals: update.distress_signals,
          opportunity_class: update.opportunity_class,
          last_analyzed_at: update.last_analyzed_at,
        })
        .eq("id", update.id);

      if (updateError) {
        console.error(`[generate-insights ${VERSION}] Error updating ${update.id}:`, updateError);
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log(`[generate-insights ${VERSION}] Complete: ${successCount} ok, ${errorCount} errors, ${aiGeneratedCount} AI, ${deterministicCount} deterministic`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        errors: errorCount,
        total: propertyIds.length,
        breakdown: {
          ai_generated: aiGeneratedCount,
          rule_based: deterministicCount,
          ai_credits_exhausted: aiCreditsExhausted,
        },
        _version: VERSION,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[generate-insights ${VERSION}] Fatal error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', _version: VERSION }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// SCORING ALGORITHM (aggregatePropertyIntelligence, calculateEnforcementIntensity,
// classifyViolation) lives in ../_shared/enforcementScoring.ts — canonical v7.1.
// ============================================================================

// ============================================================================
// DETERMINISTIC INSIGHT ENGINE v5.0 — INVESTOR VOICE
// Matches the AI investor brief format: Fact → Signal → Action Label
// Score-aligned action labels: 70+ HIGH/GOOD, 40-69 GOOD/WATCH, 0-39 WATCH/PASS
// ============================================================================
function composeEnforcementInsight(
  signals: string[],
  intelligence: PropertyIntelligence,
  classified: ViolationWithPriority[],
  snapScore?: number | null
): string {
  if (intelligence.total_violations === 0 && classified.length === 0) {
    return "No enforcement records on file. No current municipal pressure. PASS";
  }

  const score = snapScore ?? 0;
  const openCount = intelligence.open_violations;
  const totalCount = intelligence.total_violations;
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');
  const openCategories = [...new Set(openClassified.map(v => v.category).filter(c => c !== 'Other'))];
  const allCategories = [...new Set(classified.map(v => v.category).filter(c => c !== 'Other'))];
  const maxDaysOpen = openClassified.length > 0 ? Math.max(...openClassified.map(v => v.original.days_open || 0), 0) : 0;
  const highCats = [...new Set(classified.filter(v => v.priority === 'high').map(v => v.category))];
  const medCats = [...new Set(classified.filter(v => v.priority === 'medium').map(v => v.category))];
  const hasEscalation = signals.includes('enforcement_escalation') || intelligence.escalated;
  const hasWaterShutoff = signals.includes('water_shutoff_enforcement');
  const isRepeat = signals.includes('recurring_enforcement') || intelligence.repeat_offender;
  const isMultiDept = signals.includes('coordinated_enforcement') || signals.includes('multi_department') || intelligence.multi_department;
  const hasFireCitation = signals.includes('fire_citation');
  const hasVacancy = signals.includes('vacancy_citation');
  const hasStructural = signals.includes('structural_citation');
  const isRecent = signals.includes('recent_activity');
  const isCurrent = signals.includes('current_enforcement');
  const isExtended = signals.includes('extended_enforcement') || maxDaysOpen >= 180;

  // ── Determine action label based on score tier ──
  const getActionLabel = (): string => {
    if (openCount === 0) return 'PASS';
    if (hasWaterShutoff || hasEscalation) return 'CALL NOW';
    if (score >= 70) return 'CALL NOW';
    if (score >= 40) return openCount >= 3 || isRepeat || isExtended ? 'WORTH A CALL' : 'WORTH A CALL';
    // score < 40 with open violations
    if (openCount >= 3 || isExtended || isRepeat) return 'OPPORTUNITY';
    return 'OPPORTUNITY';
  };

  const catPhrase = (cats: string[]): string => {
    if (cats.length === 0) return '';
    if (cats.length === 1) return cats[0].toLowerCase();
    if (cats.length === 2) return `${cats[0].toLowerCase()} and ${cats[1].toLowerCase()}`;
    return `${cats.slice(0, 2).map(c => c.toLowerCase()).join(', ')} +${cats.length - 2} more`;
  };

  const durationPhrase = (): string => {
    if (maxDaysOpen >= 730) return `unresolved ${Math.floor(maxDaysOpen / 365)}+ years`;
    if (maxDaysOpen >= 365) return 'unresolved 1+ year';
    if (maxDaysOpen >= 180) return `unresolved ${maxDaysOpen} days`;
    if (maxDaysOpen >= 60) return `open ${maxDaysOpen} days`;
    if (maxDaysOpen >= 14) return `open ${Math.floor(maxDaysOpen / 7)} weeks`;
    if (maxDaysOpen > 0) return `open ${maxDaysOpen} days`;
    return '';
  };

  const parts: string[] = [];
  const actionLabel = getActionLabel();

  // ── FACT (Sentence 1) ──
  if (hasWaterShutoff) {
    if (openCount > 1) {
      const catStr = openCategories.length > 0 ? ` across ${catPhrase(openCategories)}` : '';
      parts.push(`Utility disconnection on record with ${openCount} concurrent enforcement actions${catStr}.`);
    } else {
      parts.push('Utility disconnection on record — active municipal enforcement action confirmed.');
    }
  } else if (openCount > 0) {
    const priorityCats = highCats.length > 0 ? highCats : (medCats.length > 0 ? medCats : openCategories);
    const catStr = priorityCats.length > 0 ? ` ${catPhrase(priorityCats)}` : '';
    const dur = durationPhrase();
    const deptStr = isMultiDept ? ' across multiple departments' : '';
    if (openCount === 1) {
      parts.push(`1 open${catStr} violation${deptStr}${dur ? ', ' + dur : ''}.`);
    } else {
      parts.push(`${openCount} open${catStr} violations${deptStr}${dur ? ', ' + dur : ''}.`);
    }
  } else if (totalCount > 0) {
    const catStr = allCategories.length > 0 ? ` (${catPhrase(allCategories)})` : '';
    parts.push(`${totalCount} resolved citation${totalCount > 1 ? 's' : ''}${catStr} — no current enforcement active.`);
  }

  // ── SIGNAL (Sentence 2) ──
  if (hasWaterShutoff && isExtended) {
    parts.push(`Long-term distress signal — no compliance activity on file.`);
  } else if (hasEscalation) {
    const allText = classified.map(v => `${(v.original.status || '')} ${(v.original.raw_description || '')}`).join(' ').toLowerCase();
    if (allText.includes('condemned') || allText.includes('condemnation')) {
      parts.push('Forced action signal — condemnation order documented.');
    } else if (allText.includes('court')) {
      parts.push('Enforcement escalated — referred to municipal court.');
    } else if (allText.includes('board') || allText.includes('hearing')) {
      parts.push('Enforcement escalated — scheduled for board hearing.');
    } else {
      parts.push('Enforcement escalated — legal obligation triggered.');
    }
  } else if (isMultiDept && isExtended) {
    parts.push('Multi-department distress pattern with no compliance activity on file.');
  } else if (isRepeat && isExtended) {
    parts.push(`Repeat citation pattern — violations remain unresolved after ${maxDaysOpen >= 365 ? Math.floor(maxDaysOpen / 365) + '+ years' : maxDaysOpen + ' days'}.`);
  } else if (isRepeat) {
    parts.push(`Repeat citation pattern confirmed — ${totalCount} total citations on record.`);
  } else if (isExtended) {
    parts.push('Long-term distress signal — no compliance activity on file.');
  } else if (isMultiDept) {
    parts.push('Multi-department enforcement coordination active.');
  } else if (hasFireCitation) {
    parts.push('Fire safety citation on record — structural risk signal.');
  } else if (hasStructural) {
    parts.push('Structural risk on record.');
  } else if (hasVacancy) {
    parts.push('Vacancy confirmed in city record.');
  } else if (isRecent) {
    parts.push('Active enforcement, no resolution — new activity within 7 days.');
  } else if (isCurrent) {
    parts.push('Active enforcement — updated within 30 days.');
  } else if (openCount > 0 && maxDaysOpen >= 60) {
    parts.push('No compliance activity on file.');
  } else if (openCount === 0 && totalCount > 0) {
    parts.push('No current enforcement pressure — monitor for changes.');
  } else if (openCount > 0) {
    parts.push('Low enforcement pressure — early-stage monitoring.');
  }

  // ── ACTION LABEL (Final) ──
  parts.push(actionLabel);

  return truncateInsight(parts);
}

function truncateInsight(parts: string[]): string {
  // Keep action label (last part) always, trim middle if needed
  if (parts.length <= 1) return parts.join(' ');
  
  const actionLabel = parts[parts.length - 1];
  const contentParts = parts.slice(0, -1);
  
  // Try all content parts
  let result = [...contentParts, actionLabel].join(' ');
  if (result.length <= 300) return result;

  // Trim to 2 content parts
  result = [...contentParts.slice(0, 2), actionLabel].join(' ');
  if (result.length <= 300) return result;

  // Trim to 1 content part
  result = [contentParts[0], actionLabel].join(' ');
  if (result.length <= 300) return result;

  // Last resort: truncate the fact
  return contentParts[0].substring(0, 290 - actionLabel.length) + '... ' + actionLabel;
}
