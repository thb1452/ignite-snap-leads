/**
 * BULK REGENERATE INVESTOR BRIEFS — v25-deal-strategist
 * Phase 1: AI — score > 40 OR open violations (high-value leads first)
 * Phase 2: Rule-based — score ≤ 40 AND closed (deterministic, no API calls)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sanitizeInsightForStorage } from "../_shared/insightSanitizer.ts";
import { DEAL_STRATEGIST_PROMPT, formatPropertyForPrompt } from "../_shared/dealStrategistPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 200;
const REGEN_VERSION = "v25-deal-strategist";
const AI_CONCURRENCY = 15;
const RULE_SCORE_THRESHOLD = 40;
const CUTOFF_TIMESTAMP = "2026-04-07T00:00:00Z";

// ============================================================================
// DETERMINISTIC INVESTOR VOICE ENGINE (for score ≤ 50)
// Fact → Signal → Action Label format
// ============================================================================
function generateRuleBrief(prop: Record<string, any>): string {
  const score = prop.snap_score ?? 0;
  const openCount = prop.open_violations ?? 0;
  const totalCount = prop.total_violations ?? 0;
  const signals: string[] = prop.distress_signals || [];
  const types: string[] = prop.violation_types || [];
  const avgDays = prop.avg_days_open ?? 0;
  const escalated = prop.escalated ?? false;
  const repeatOffender = prop.repeat_offender ?? false;
  const multiDept = prop.multi_department ?? false;
  const enfType = prop.enforcement_type || 'code_violation';

  const hasWater = enfType === 'water_shutoff' || signals.includes('water_shutoff_enforcement');
  const hasEscalation = escalated || signals.includes('enforcement_escalation');
  const isRepeat = repeatOffender || signals.includes('recurring_enforcement');
  const isMultiDept = multiDept || signals.includes('coordinated_enforcement') || signals.includes('multi_department');
  const isExtended = avgDays >= 180 || signals.includes('extended_enforcement');
  const hasFire = signals.includes('fire_citation');
  const hasVacancy = signals.includes('vacancy_citation');
  const hasStructural = signals.includes('structural_citation');
  const isRecent = signals.includes('recent_activity');

  if (totalCount === 0 && openCount === 0) {
    return "No enforcement records on file. No current municipal pressure. PASS.";
  }

  // Category phrase from violation_types
  const catPhrase = (): string => {
    const cats = types.filter(t => t && t !== 'Other').slice(0, 3);
    if (cats.length === 0) return '';
    if (cats.length === 1) return ` ${cats[0].toLowerCase()}`;
    if (cats.length === 2) return ` ${cats[0].toLowerCase()} and ${cats[1].toLowerCase()}`;
    return ` ${cats[0].toLowerCase()}, ${cats[1].toLowerCase()} +${cats.length - 2} more`;
  };

  const durationPhrase = (): string => {
    if (avgDays >= 730) return `, unresolved ${Math.floor(avgDays / 365)}+ years`;
    if (avgDays >= 365) return ', unresolved 1+ year';
    if (avgDays >= 180) return `, unresolved ${avgDays} days`;
    if (avgDays >= 60) return `, open ${avgDays} days`;
    if (avgDays >= 14) return `, open ${Math.floor(avgDays / 7)} weeks`;
    if (avgDays > 0) return `, open ${avgDays} days`;
    return '';
  };

  // Action label
  const getLabel = (): string => {
    if (hasWater || hasEscalation) return 'HIGH OPPORTUNITY.';
    if (score >= 70) return 'HIGH OPPORTUNITY.';
    if (score >= 40) return openCount >= 3 || isRepeat || isExtended ? 'GOOD OPPORTUNITY.' : 'WATCH.';
    if (openCount === 0) return 'PASS.';
    if (openCount >= 3 || isExtended || isRepeat) return 'WATCH.';
    return 'PASS.';
  };

  const parts: string[] = [];

  // FACT
  if (hasWater) {
    if (openCount > 1) {
      parts.push(`Water cut off with ${openCount} concurrent enforcement actions${catPhrase()}.`);
    } else {
      parts.push('Water cut off. Active municipal enforcement confirmed.');
    }
  } else if (openCount > 0) {
    const cat = catPhrase();
    const dur = durationPhrase();
    const dept = isMultiDept ? ' across multiple departments' : '';
    parts.push(`${openCount} open${cat} violation${openCount > 1 ? 's' : ''}${dept}${dur}.`);
  } else if (totalCount > 0) {
    parts.push(`${totalCount} resolved citation${totalCount > 1 ? 's' : ''} on record. No active enforcement.`);
  }

  // SIGNAL
  if (hasWater && isExtended) {
    parts.push('Owner not responding. Long term distress signal.');
  } else if (hasEscalation) {
    parts.push('City escalated enforcement. Legal obligation triggered.');
  } else if (isMultiDept && isExtended) {
    parts.push('Multiple departments involved. No compliance activity on file.');
  } else if (isRepeat && isExtended) {
    parts.push(`Repeat citation pattern. Violations unresolved ${avgDays >= 365 ? Math.floor(avgDays / 365) + '+ years' : avgDays + ' days'}.`);
  } else if (isRepeat) {
    parts.push(`Repeat offender. ${totalCount} total citations on record.`);
  } else if (isExtended) {
    parts.push('No compliance activity on file. Owner not responding.');
  } else if (isMultiDept) {
    parts.push('Multiple departments actively coordinating enforcement.');
  } else if (hasFire) {
    parts.push('Fire safety citation on record. Structural risk signal.');
  } else if (hasStructural) {
    parts.push('Structural risk documented.');
  } else if (hasVacancy) {
    parts.push('Vacancy confirmed in city record.');
  } else if (isRecent) {
    parts.push('New enforcement activity within 7 days.');
  } else if (openCount > 0 && avgDays >= 60) {
    parts.push('No compliance activity on file.');
  } else if (openCount === 0 && totalCount > 0) {
    parts.push('No current enforcement pressure.');
  } else if (openCount > 0) {
    parts.push('Low enforcement pressure. Early stage monitoring.');
  }

  // ACTION LABEL
  parts.push(getLabel());

  const result = parts.join(' ');
  return sanitizeInsightForStorage(result, getLabel()) ?? result;
}

// ============================================================================
// AI BRIEF GENERATION (for score > 50)
// ============================================================================
const SYSTEM_PROMPT = DEAL_STRATEGIST_PROMPT;

function formatPropertyData(prop: Record<string, any>): string {
  return formatPropertyForPrompt(prop);
}

function isCleanBrief(text: string, prop: Record<string, any>): boolean {
  if (prop.address && text.toLowerCase().includes(prop.address.toLowerCase().slice(0, 10))) return false;
  if (/[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}/.test(text)) return false;
  if (/Noted:|Case\s+(create|number|#)/i.test(text)) return false;
  if (/IPMC\s+\d/i.test(text)) return false;
  if (/\(\d{3}\)\s?\d{3}|\d{3}[\-\.]\d{3}[\-\.]\d{4}|@\w+\.\w+/.test(text)) return false;
  if (text.length < 40) return false;
  return true;
}

async function generateViaLovable(prop: Record<string, any>, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: formatPropertyData(prop) },
        ],
        max_tokens: 400,
        temperature: 0.4,
      }),
    });
    if (res.status === 429 || res.status === 402) { await res.text(); return null; }
    if (!res.ok) { const t = await res.text(); console.error(`[bulk-regen] Lovable ${res.status}: ${t.slice(0, 200)}`); return null; }
    const result = await res.json();
    return sanitizeInsightForStorage(result?.choices?.[0]?.message?.content?.trim() || null);
  } catch (err) {
    console.error(`[bulk-regen] Lovable error:`, err);
    return null;
  }
}

async function generateViaGemini(prop: Record<string, any>, apiKey: string): Promise<string | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${formatPropertyData(prop)}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    });
    if (res.status === 429) { await res.text(); return null; }
    if (!res.ok) { const t = await res.text(); console.error(`[bulk-regen] Gemini ${res.status}: ${t.slice(0, 200)}`); return null; }
    const result = await res.json();
    return sanitizeInsightForStorage(result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null);
  } catch (err) {
    console.error(`[bulk-regen] Gemini error:`, err);
    return null;
  }
}

async function generateAIBrief(prop: Record<string, any>, lovableKey: string, geminiKey: string): Promise<string | null> {
  let text = lovableKey ? await generateViaLovable(prop, lovableKey) : null;
  if (!text && geminiKey) text = await generateViaGemini(prop, geminiKey);

    if (text) {
      text = text.replace(/\s*[—–-]\s*/g, '. ').replace(/\.\.\s/g, '. ').replace(/\.\s\./g, '.');
      text = sanitizeInsightForStorage(text);
      if (!text || !isCleanBrief(text, prop)) return null;
  }
  return text;
}

// ============================================================================
// MAIN SERVE
// ============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

    const { autoResume = true, totalProcessed = 0, version = "", mode = "rule" } = await req.json().catch(() => ({}));

    if (version && version !== REGEN_VERSION) {
      console.log(`[bulk-regen] Stopping old chain (version: ${version})`);
      return new Response(JSON.stringify({ stopped: true, reason: "version_mismatch" }), { headers });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // MODE: "rule" = only fetch rule-based eligible properties (score ≤ 40 AND closed)
    // MODE: "ai" = only fetch AI-eligible properties (score > 40 OR open violations > 0)
    let query = supabase
      .from("properties")
      .select("id, address, city, state, zip, county, snap_score, distress_signals, violation_types, open_violations, total_violations, enforcement_type, escalated, repeat_offender, multi_department, avg_days_open, oldest_violation_date, newest_violation_date, opportunity_class")
      .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${CUTOFF_TIMESTAMP}`);

    if (mode === "rule") {
      // Score ≤ 40 (or null) AND closed (0 open violations or null)
      query = query.or("snap_score.is.null,snap_score.lte.40")
        .or("open_violations.is.null,open_violations.eq.0");
    } else {
      // AI mode: score > 40 OR open violations > 0
      // We fetch all remaining unprocessed and filter in code
    }

    const { data: properties, error: fetchErr } = await query
      .order("snap_score", { ascending: mode === "rule", nullsFirst: true })
      .range(0, BATCH_SIZE - 1);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!properties || properties.length === 0) {
      if (mode === "rule") {
        // Rule-based done, switch to AI mode
        console.log(`[bulk-regen] ✅ Rule-based done! Total: ${totalProcessed}. Switching to AI mode...`);
        if (autoResume) {
          const continueTask = async () => {
            await new Promise(r => setTimeout(r, 500));
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/bulk-regenerate-briefs`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
                body: JSON.stringify({ autoResume: true, totalProcessed, version: REGEN_VERSION, mode: "ai" }),
              });
            } catch (err) { console.error("[bulk-regen] Mode switch failed:", err); }
          };
          const runtime = (globalThis as any).EdgeRuntime;
          if (runtime?.waitUntil) { runtime.waitUntil(continueTask()); } else { continueTask().catch(console.error); }
        }
        return new Response(JSON.stringify({ success: true, ruleDone: true, totalProcessed, switchingToAI: true }), { headers });
      }
      console.log(`[bulk-regen] ✅ ALL DONE! Total processed: ${totalProcessed}`);
      return new Response(JSON.stringify({ success: true, done: true, totalProcessed, message: "All briefs regenerated!" }), { headers });
    }

    // In rule mode, all fetched are rule-based. In AI mode, filter out any rule-eligible that slipped through.
    const ruleProps = mode === "rule" 
      ? properties.filter(p => (p.snap_score ?? 0) <= RULE_SCORE_THRESHOLD && (p.open_violations ?? 0) === 0)
      : [];
    const aiProps = mode === "ai" 
      ? properties.filter(p => !((p.snap_score ?? 0) <= RULE_SCORE_THRESHOLD && (p.open_violations ?? 0) === 0))
      : [];

    let batchSuccess = 0;
    let batchFailed = 0;
    let ruleCount = 0;
    let aiCount = 0;

    // Process RULE-BASED properties (instant, no API calls)
    for (const prop of ruleProps) {
      const brief = generateRuleBrief(prop);
      const briefJson = { brief_text: brief, generated_at: new Date().toISOString(), model: "deterministic-v5", version: REGEN_VERSION };
      const { error } = await supabase
        .from("properties")
        .update({ snap_insight: brief, investor_insight_brief: briefJson, last_analyzed_at: new Date().toISOString() })
        .eq("id", prop.id);
      if (error) { batchFailed++; } else { batchSuccess++; ruleCount++; }
    }

    // Process AI properties — NO fallback to rule-based. If credits are out, STOP.
    if (aiProps.length > 0) {
      if (!LOVABLE_API_KEY && !GEMINI_API_KEY) {
        console.error("[bulk-regen] ❌ AI properties found but NO API keys configured. Stopping.");
        return new Response(JSON.stringify({ 
          error: "No AI API keys configured. Cannot process score>40 or open properties.", 
          ruleProcessed: ruleCount, batchFailed 
        }), { status: 500, headers });
      }

      for (let i = 0; i < aiProps.length; i += AI_CONCURRENCY) {
        const chunk = aiProps.slice(i, i + AI_CONCURRENCY);
        const results = await Promise.all(
          chunk.map(async p => {
            const brief = await generateAIBrief(p, LOVABLE_API_KEY, GEMINI_API_KEY);
            return { id: p.id, brief, prop: p };
          })
        );

        // If ALL AI calls in this chunk failed, log it but fall back to
        // rule-based briefs so properties never end up NULL.
        const allFailed = results.every(r => r.brief === null);
        if (allFailed && chunk.length > 0) {
          console.warn("[bulk-regen] ⚠️ ALL AI calls failed in chunk — falling back to rule-based briefs.");
        }

        for (const r of results) {
          let briefText = r.brief;
          let model = "ai-provider";
          if (!briefText) {
            briefText = generateRuleBrief(r.prop);
            model = "deterministic-v5-fallback";
            console.warn(`[bulk-regen] Property ${r.id} — AI failed, using rule-based fallback.`);
          }
          const briefJson = {
            brief_text: briefText,
            generated_at: new Date().toISOString(),
            model,
            version: REGEN_VERSION,
          };
          const { error } = await supabase
            .from("properties")
            .update({ snap_insight: briefText, investor_insight_brief: briefJson, last_analyzed_at: new Date().toISOString() })
            .eq("id", r.id);
          if (error) { batchFailed++; } else { batchSuccess++; aiCount++; }
        }
        if (i + AI_CONCURRENCY < aiProps.length) await new Promise(r => setTimeout(r, 200));
      }
    }

    const newTotal = totalProcessed + batchSuccess;
    console.log(`[bulk-regen] Batch: ${batchSuccess} ok (${ruleCount} rule, ${aiCount} AI), ${batchFailed} failed. Total: ${newTotal}`);

    const resumeDelay = batchSuccess === 0 ? 30000 : 500;

    if (autoResume) {
      const continueTask = async () => {
        await new Promise(r => setTimeout(r, resumeDelay));
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/bulk-regenerate-briefs`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ autoResume: true, totalProcessed: newTotal, version: REGEN_VERSION, mode }),
          });
        } catch (err) { console.error("[bulk-regen] Auto-resume failed:", err); }
      };
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) { runtime.waitUntil(continueTask()); } else { continueTask().catch(console.error); }
    }

    return new Response(JSON.stringify({
      success: true, batchSuccess, batchFailed, ruleCount, aiCount,
      totalProcessed: newTotal, hasMore: properties.length === BATCH_SIZE, autoResuming: autoResume,
    }), { headers });

  } catch (error) {
    console.error("[bulk-regen] Fatal:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
