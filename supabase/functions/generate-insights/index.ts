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

const VERSION = "v9.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SNAP_SCORE_AI_THRESHOLD = 20;

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  days_open: number | null;
  opened_date: string | null;
  raw_description: string | null;
  last_updated: string | null;
}

interface ViolationWithPriority {
  category: string;
  priority: 'high' | 'medium' | 'low';
  original: Violation;
}

interface SnapScoreResult {
  score: number;
  signals: string[];
  activityClass: 'critical' | 'elevated' | 'monitoring';
}

interface PropertyIntelligence {
  total_violations: number;
  open_violations: number;
  oldest_violation_date: string | null;
  newest_violation_date: string | null;
  avg_days_open: number;
  violation_types: string[];
  repeat_offender: boolean;
  multi_department: boolean;
  escalated: boolean;
  oldest_violation_days: number;
  high_priority_count: number;
  medium_priority_count: number;
  low_priority_count: number;
}

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

    // Build signal stack emojis
    const signalIcons: string[] = [];
    if (isWaterShutoff) signalIcons.push('🔴 Water Shutoff');
    if (hasFireCitation) signalIcons.push('🔥 Fire Citation');
    if (isEscalated) signalIcons.push('⚠️ Escalated');
    if (intelligence.repeat_offender) signalIcons.push('🔁 Repeat Offender');
    if (intelligence.multi_department) signalIcons.push('🏛️ Multi-Department');
    if (scoreResult.signals.includes('extended_enforcement')) signalIcons.push('📅 Extended Enforcement');
    if (scoreResult.signals.includes('active_enforcement_load')) signalIcons.push('🚨 Active Load');

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

    const systemPrompt = `You are a field intelligence analyst writing ultra-short property distress briefs for real estate wholesalers.

STRICT FORMAT — no exceptions:
- Exactly 3 SHORT sentences. Each sentence MUST be 15 words or fewer.
- Then a blank line.
- Then the action label alone on its own line: CALL NOW or WORTH A CALL or WATCH.
- Nothing else. No headers, no bullet points, no signal lists.

SENTENCE GUIDE:
- Sentence 1: Lead distress signal with a specific number or fact.
- Sentence 2: Stack one or two additional enforcement details.
- Sentence 3: What gets worse if the buyer waits.

STYLE:
- Write like a scout reporting from the field. Punchy. Blunt. Factual.
- NEVER use variable names, booleans, or code syntax.
- NEVER use: "may", "could", "potential", "opportunity", "seems", "appears"
- Translate data to plain English:
  repeat_offender → "owner non-responsive to city notices"
  multi_department → "multiple departments enforcing"
  escalated → "enforcement escalated to legal action"
  water_shutoff → "water disconnected"
  fire_citation → "fire department citation on file"
- If a field is null or empty, skip it entirely.

ACTION LABEL RULES:
- CALL NOW: escalated OR water shutoff OR fire citation OR (score 90+ AND 4+ open)
- WORTH A CALL: score 70-89 OR 2-3 open violations
- WATCH: score under 70 OR all violations resolved

EXAMPLE OUTPUT:
Water disconnected since Feb 2026. 3 open violations including structural and exterior. Owner non-responsive to city notices.

CALL NOW`;

    const userPrompt = `INPUT DATA:
${inputLines.join('\n')}

OUTPUT — exactly 3 sentences then the action label, nothing else:`;

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
// PROPERTY INTELLIGENCE AGGREGATION — v7.1
// Now accepts classified violations for severity counts
// Checks property-level escalated flag + violation statuses
// ============================================================================
function aggregatePropertyIntelligence(
  violations: Violation[],
  classified: ViolationWithPriority[],
  propertyEscalated?: boolean
): PropertyIntelligence {
  const escalatedStatuses = ['board', 'legal', 'court', 'condemned', 'prosecution'];
  const now = new Date();
  
  // Derive days_open from opened_date when null; warn if both null
  for (const v of violations) {
    if (v.days_open == null && v.opened_date) {
      const opened = new Date(v.opened_date);
      if (!isNaN(opened.getTime())) {
        v.days_open = Math.max(0, Math.floor((now.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }
    // Also check last_updated as fallback for days_open
    if (v.days_open == null && v.last_updated) {
      const updated = new Date(v.last_updated);
      if (!isNaN(updated.getTime())) {
        v.days_open = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }
    if (v.days_open == null && !v.opened_date && !v.last_updated) {
      console.warn(`[generate-insights ${VERSION}] Violation ${v.id} has no date info — days_open defaults to 0`);
    }
  }
  
  const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
  
  const now_ts = now.getTime();
  const dates = violations
    .map(v => v.opened_date)
    .filter(d => d)
    .map(d => new Date(d!))
    .filter(d => !isNaN(d.getTime()) && d.getTime() <= now_ts) // Filter out future dates
    .sort((a, b) => a.getTime() - b.getTime());
  
  const daysOpen = violations.map(v => v.days_open || 0);
  const avgDays = daysOpen.length > 0 
    ? Math.round(daysOpen.reduce((a, b) => a + b, 0) / daysOpen.length) 
    : 0;
  
  const violationTypes = [...new Set(violations.map(v => v.violation_type).filter(Boolean))];
  
  // Escalation: check property flag OR violation statuses (condemned gets escalation even if closed)
  const hasStatusEscalation = violations.some(v => {
    const status = (v.status || '').toLowerCase();
    return escalatedStatuses.some(s => status.includes(s));
  });
  // Also check raw_description for condemned/condemnation even on closed violations
  const hasDescEscalation = violations.some(v => {
    const desc = (v.raw_description || '').toLowerCase();
    return desc.includes('condemned') || desc.includes('condemnation') || desc.includes('unsafe structure');
  });
  const isEscalated = !!propertyEscalated || hasStatusEscalation || hasDescEscalation;
  
  // Oldest violation in days
  const oldestDays = dates.length > 0 
    ? Math.max(0, Math.floor((now.getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Severity counts from classified violations
  const highCount = classified.filter(v => v.priority === 'high').length;
  const medCount = classified.filter(v => v.priority === 'medium').length;
  const lowCount = classified.filter(v => v.priority === 'low').length;

  // Multi-department: use keyword-derived categories (not just violation_type)
  const uniqueCategories = [...new Set(classified.map(v => v.category).filter(c => c !== 'Other'))];
  
  return {
    total_violations: violations.length,
    open_violations: openViolations.length,
    oldest_violation_date: dates.length > 0 ? dates[0].toISOString().split('T')[0] : null,
    newest_violation_date: dates.length > 0 ? dates[dates.length - 1].toISOString().split('T')[0] : null,
    avg_days_open: avgDays,
    violation_types: violationTypes,
    repeat_offender: violations.length >= 3,
    multi_department: uniqueCategories.length >= 2,
    escalated: isEscalated,
    oldest_violation_days: oldestDays,
    high_priority_count: highCount,
    medium_priority_count: medCount,
    low_priority_count: lowCount,
  };
}

// ============================================================================
// ENFORCEMENT INTENSITY SCORING — v7.1
// Fixes: progressive volume scaling (no cap at 50), recency checks last_updated
// first, escalation for condemned even if closed, multi-category from keywords
// ============================================================================
function calculateEnforcementIntensity(
  violations: Violation[],
  classified: ViolationWithPriority[],
  intelligence: PropertyIntelligence
): SnapScoreResult {
  let score = 0;
  const signals: string[] = [];
  
  const openViolations = violations.filter(v => (v.status || '').toLowerCase().trim() === 'open');
  const openClassified = classified.filter(c => (c.original.status || '').toLowerCase().trim() === 'open');
  
  // ── Duration Factor ──
  const maxDaysOpen = openViolations.length > 0 
    ? Math.max(...openViolations.map(v => v.days_open || 0), 0)
    : 0;
  const monthsOpen = Math.floor(maxDaysOpen / 30);
  score += Math.min(30, monthsOpen * 3);
  if (maxDaysOpen > 180) signals.push('extended_enforcement');
  
  // ── Priority Matrix ──
  const highPriorityCount = openClassified.filter(v => v.priority === 'high').length;
  const mediumPriorityCount = openClassified.filter(v => v.priority === 'medium').length;
  
  if (highPriorityCount > 0) {
    score += 40 + Math.min((highPriorityCount - 1) * 10, 20);
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Fire')) signals.push('fire_citation');
    if (openClassified.some(v => v.priority === 'high' && v.category === 'Structural')) signals.push('structural_citation');
  }
  score += Math.min(mediumPriorityCount * 15, 30);
  
  // ── Repeat Activity & Volume ──
  const totalViolCount = violations.length;
  const openViolCount = openViolations.length;
  
  if (totalViolCount >= 10) {
    score += 30;
    signals.push('recurring_enforcement');
  } else if (totalViolCount >= 5) {
    score += 25;
    signals.push('recurring_enforcement');
  } else if (totalViolCount >= 3) {
    score += 15;
    signals.push('multiple_citations');
  } else if (totalViolCount >= 2) {
    score += 5;
    signals.push('multiple_citations');
  }

  // ── Open Violation Volume — PROGRESSIVE (no hard cap) ──
  // Uses log scaling so 200 open scores higher than 50
  if (openViolCount >= 200) {
    score += 70;
    signals.push('extreme_enforcement_load');
  } else if (openViolCount >= 100) {
    score += 60;
    signals.push('massive_enforcement_load');
  } else if (openViolCount >= 50) {
    score += 50;
    signals.push('massive_enforcement_load');
  } else if (openViolCount >= 20) {
    score += 40;
    signals.push('high_violation_volume');
  } else if (openViolCount >= 10) {
    score += 30;
    signals.push('high_violation_volume');
  } else if (openViolCount >= 5) {
    score += 20;
    signals.push('active_enforcement_load');
  } else if (openViolCount >= 3) {
    score += 10;
    signals.push('active_enforcement_load');
  }
  
  // ── Multi-Category (keyword-derived, not just violation_type) ──
  const openCategories = [...new Set(openClassified.map(v => v.category).filter(c => c !== 'Other'))];
  if (openCategories.length >= 3) {
    score += 25;
    signals.push('coordinated_enforcement');
  } else if (openCategories.length >= 2) {
    score += 15;
    signals.push('multi_department');
  }
  
  // ── Escalation — check ALL violations (not just open) for condemned ──
  if (intelligence.escalated) {
    const allStatuses = violations.map(v => (v.status || '').toLowerCase());
    const allDescs = violations.map(v => (v.raw_description || '').toLowerCase());
    const combined = [...allStatuses, ...allDescs].join(' ');
    
    if (combined.includes('condemned') || combined.includes('prosecution') || combined.includes('condemnation')) {
      score += 30;
      signals.push('enforcement_escalation');
    } else if (combined.includes('legal') || combined.includes('court')) {
      score += 25;
      signals.push('enforcement_escalation');
    } else if (combined.includes('board') || combined.includes('hearing')) {
      score += 15;
      signals.push('enforcement_escalation');
    }
  }
  
  // ── Vacancy ──
  const hasVacancySignals = openClassified.some(v => 
    v.category === 'Vacancy' ||
    (v.original.violation_type || '').toLowerCase().includes('vacant') ||
    (v.original.violation_type || '').toLowerCase().includes('abandon')
  );
  if (hasVacancySignals) {
    score += 25;
    signals.push('vacancy_citation');
  }
  
  // ── Recency — check last_updated FIRST, fall back to opened_date ──
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const getRecentDate = (v: Violation): Date | null => {
    // Check last_updated first (more recent activity on old violations)
    if (v.last_updated) {
      const d = new Date(v.last_updated);
      if (!isNaN(d.getTime())) return d;
    }
    if (v.opened_date) {
      const d = new Date(v.opened_date);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };
  
  const hasRecent7 = violations.some(v => {
    const d = getRecentDate(v);
    return d && d >= sevenDaysAgo;
  });
  const hasRecent30 = !hasRecent7 && violations.some(v => {
    const d = getRecentDate(v);
    return d && d >= thirtyDaysAgo;
  });
  
  if (hasRecent7) {
    score += 40;
    signals.push('recent_activity');
  } else if (hasRecent30) {
    score += 20;
    signals.push('current_enforcement');
  }

  // ── Water Shutoff ──
  // Detect via enforcement_type first, then keyword scan — never silently skip
  const hasWaterShutoff = (violations as any).__enforcement_type === 'water_shutoff' ||
    classified.some(v => {
      const combined = `${(v.original.violation_type || '').toLowerCase()} ${(v.original.raw_description || '').toLowerCase()}`;
      return combined.includes('water shutoff') || combined.includes('water disconnect') ||
             combined.includes('no water') || combined.includes('water termination') ||
             combined.includes('water service disconnect');
    });
  
  const hasOpenCodeViolations = openClassified.filter(v => v.category !== 'Utility').length > 0;
  
  if (hasWaterShutoff) {
    signals.push('water_shutoff_enforcement');
    
    if (hasOpenCodeViolations && intelligence.repeat_offender && (hasRecent7 || hasRecent30)) {
      score += 55;
      signals.push('maximum_enforcement_pressure');
    } else if (hasRecent7 || hasRecent30) {
      score += 48;
      signals.push('active_enforcement_current');
    } else if (hasOpenCodeViolations) {
      score += 42;
      signals.push('compounding_enforcement');
    } else {
      score += 40;
      signals.push('direct_municipal_action');
    }
  }

  if (!hasWaterShutoff && openClassified.some(v => v.category === 'Utility')) {
    signals.push('utility_enforcement');
  }
  
  // Cap score if all violations resolved (but escalated condemned still gets some credit)
  if (openViolations.length === 0 && violations.length > 0) {
    if (intelligence.escalated) {
      score = Math.min(score, 35); // Condemned properties keep some score even if closed
    } else {
      score = Math.min(score, 20);
    }
  }
  
  const finalScore = Math.min(100, Math.max(0, score));
  
  let activityClass: 'critical' | 'elevated' | 'monitoring' = 'monitoring';
  if (finalScore >= 70) activityClass = 'critical';
  else if (finalScore >= 40) activityClass = 'elevated';
  
  return { score: finalScore, signals, activityClass };
}

// ============================================================================
// VIOLATION CLASSIFICATION — uses keyword scan on combined type + description
// ============================================================================
function classifyViolation(violation: Violation): ViolationWithPriority {
  const t = (violation.violation_type || '').toLowerCase();
  const desc = (violation.raw_description || '').toLowerCase();
  const combined = `${t} ${desc}`;
  
  // HIGH PRIORITY
  if (combined.includes('collapse') || combined.includes('unsafe structure') || 
      combined.includes('condemned') || combined.includes('foundation failure') ||
      combined.includes('imminent danger')) {
    return { category: 'Structural', priority: 'high', original: violation };
  }
  
  if (combined.includes('fire damage') || combined.includes('burnt') || 
      combined.includes('smoke damage') || combined.includes('charred')) {
    return { category: 'Fire', priority: 'high', original: violation };
  }
  
  if (combined.includes('no utilities') || combined.includes('utility disconnect') ||
      combined.includes('no water') || combined.includes('no electric') ||
      combined.includes('water disconnect') || combined.includes('water shutoff')) {
    return { category: 'Utility', priority: 'high', original: violation };
  }
  
  // MEDIUM PRIORITY
  if (combined.includes('roof leak') || combined.includes('structural damage') ||
      combined.includes('foundation crack') || combined.includes('major repair')) {
    return { category: 'Structural', priority: 'medium', original: violation };
  }
  
  if (combined.includes('vacant') || combined.includes('abandon') || 
      combined.includes('unoccup') || combined.includes('boarded')) {
    return { category: 'Vacancy', priority: 'medium', original: violation };
  }
  
  if (combined.includes('unsafe') || combined.includes('hazard') || 
      combined.includes('danger') || combined.includes('health')) {
    return { category: 'Safety', priority: 'medium', original: violation };
  }
  
  if (combined.includes('plumbing') || combined.includes('electrical') ||
      combined.includes('sewage') || combined.includes('hvac')) {
    return { category: 'Utility', priority: 'medium', original: violation };
  }
  
  if (combined.includes('zoning') || combined.includes('zone violation') ||
      combined.includes('land use') || combined.includes('code enforcement') ||
      combined.includes('unpermitted') || combined.includes('without permit') ||
      combined.includes('permit violation') || combined.includes('illegal construction')) {
    return { category: 'Zoning', priority: 'medium', original: violation };
  }

  if (combined.includes('property maintenance') || combined.includes('property inspection') ||
      combined.includes('code compliance') || combined.includes('nuisance')) {
    return { category: 'Maintenance', priority: 'medium', original: violation };
  }
  
  // LOW PRIORITY
  if (combined.includes('paint') || combined.includes('siding') || 
      combined.includes('fence') || combined.includes('grass') ||
      combined.includes('weeds') || combined.includes('debris')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  if (combined.includes('window') || combined.includes('door') ||
      combined.includes('screen') || combined.includes('gutter')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  // Defaults
  if (combined.includes('structur') || combined.includes('foundation') || 
      combined.includes('roof') || combined.includes('wall')) {
    return { category: 'Structural', priority: 'medium', original: violation };
  }
  
  if (combined.includes('fire') || combined.includes('burn') || combined.includes('smoke')) {
    return { category: 'Fire', priority: 'high', original: violation };
  }
  
  if (combined.includes('exterior') || combined.includes('facade')) {
    return { category: 'Exterior', priority: 'low', original: violation };
  }
  
  // Open violations of unknown type → medium priority (not ignored)
  const status = (violation.status || '').toLowerCase().trim();
  if (status === 'open') {
    return { category: 'General Enforcement', priority: 'medium', original: violation };
  }
  
  return { category: 'Other', priority: 'low', original: violation };
}

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
    if (hasWaterShutoff || hasEscalation) return 'HIGH OPPORTUNITY';
    if (score >= 70) return highCats.length > 0 || isMultiDept ? 'HIGH OPPORTUNITY' : 'GOOD OPPORTUNITY';
    if (score >= 40) return openCount >= 3 || isRepeat || isExtended ? 'GOOD OPPORTUNITY' : 'WATCH';
    // score < 40
    if (openCount === 0) return 'PASS';
    if (openCount >= 3 || isExtended || isRepeat) return 'WATCH';
    return 'PASS';
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
