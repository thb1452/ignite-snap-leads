import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sanitizeInsightForStorage } from "../_shared/insightSanitizer.ts";
import { DEAL_STRATEGIST_PROMPT, formatPropertyForPrompt } from "../_shared/dealStrategistPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE_RULE = 500;
const BATCH_SIZE_AI = 250;
const REGEN_VERSION = "v29-ai-upgrade-rulebased";
const AI_CONCURRENCY = 10;
const RULE_SCORE_THRESHOLD = 0;
const CUTOFF_TIMESTAMP = "2026-04-07T00:00:00Z";

type AzureConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
};

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
  const enfType = prop.enforcement_type || "code_violation";

  const hasWater = enfType === "water_shutoff" || signals.includes("water_shutoff_enforcement");
  const hasEscalation = escalated || signals.includes("enforcement_escalation");
  const isRepeat = repeatOffender || signals.includes("recurring_enforcement");
  const isMultiDept = multiDept || signals.includes("coordinated_enforcement") || signals.includes("multi_department");
  const isExtended = avgDays >= 180 || signals.includes("extended_enforcement");
  const hasFire = signals.includes("fire_citation");
  const hasVacancy = signals.includes("vacancy_citation");
  const hasStructural = signals.includes("structural_citation");
  const isRecent = signals.includes("recent_activity");

  if (totalCount === 0 && openCount === 0) {
    return "No enforcement records on file. No current municipal pressure. PASS.";
  }

  const catPhrase = (): string => {
    const cats = types.filter((t) => t && t !== "Other").slice(0, 3);
    if (cats.length === 0) return "";
    if (cats.length === 1) return ` ${cats[0].toLowerCase()}`;
    if (cats.length === 2) return ` ${cats[0].toLowerCase()} and ${cats[1].toLowerCase()}`;
    return ` ${cats[0].toLowerCase()}, ${cats[1].toLowerCase()} +${cats.length - 2} more`;
  };

  const durationPhrase = (): string => {
    if (avgDays >= 730) return `, unresolved ${Math.floor(avgDays / 365)}+ years`;
    if (avgDays >= 365) return ", unresolved 1+ year";
    if (avgDays >= 180) return `, unresolved ${avgDays} days`;
    if (avgDays >= 60) return `, open ${avgDays} days`;
    if (avgDays >= 14) return `, open ${Math.floor(avgDays / 7)} weeks`;
    if (avgDays > 0) return `, open ${avgDays} days`;
    return "";
  };

  const getLabel = (): string => {
    if (openCount === 0) return "PASS";
    if (hasWater || hasEscalation) return "CALL NOW";
    if (score >= 70) return "CALL NOW";
    if (score >= 40) return openCount >= 3 || isRepeat || isExtended ? "WORTH A CALL" : "WORTH A CALL";
    // score < 40 with open violations
    if (openCount >= 3 || isExtended || isRepeat) return "OPPORTUNITY";
    return "OPPORTUNITY";
  };

  const parts: string[] = [];

  if (hasWater) {
    if (openCount > 1) {
      parts.push(`Water cut off with ${openCount} concurrent enforcement actions${catPhrase()}.`);
    } else {
      parts.push("Water cut off. Active municipal enforcement confirmed.");
    }
  } else if (openCount > 0) {
    const cat = catPhrase();
    const dur = durationPhrase();
    const dept = isMultiDept ? " across multiple departments" : "";
    parts.push(`${openCount} open${cat} violation${openCount > 1 ? "s" : ""}${dept}${dur}.`);
  } else if (totalCount > 0) {
    parts.push(`${totalCount} resolved citation${totalCount > 1 ? "s" : ""} on record. No active enforcement.`);
  }

  if (hasWater && isExtended) {
    parts.push("Owner not responding. Long term distress signal.");
  } else if (hasEscalation) {
    parts.push("City escalated enforcement. Legal obligation triggered.");
  } else if (isMultiDept && isExtended) {
    parts.push("Multiple departments involved. No compliance activity on file.");
  } else if (isRepeat && isExtended) {
    parts.push(`Repeat citation pattern. Violations unresolved ${avgDays >= 365 ? Math.floor(avgDays / 365) + "+ years" : avgDays + " days"}.`);
  } else if (isRepeat) {
    parts.push(`Repeat offender. ${totalCount} total citations on record.`);
  } else if (isExtended) {
    parts.push("No compliance activity on file. Owner not responding.");
  } else if (isMultiDept) {
    parts.push("Multiple departments actively coordinating enforcement.");
  } else if (hasFire) {
    parts.push("Fire safety citation on record. Structural risk signal.");
  } else if (hasStructural) {
    parts.push("Structural risk documented.");
  } else if (hasVacancy) {
    parts.push("Vacancy confirmed in city record.");
  } else if (isRecent) {
    parts.push("New enforcement activity within 7 days.");
  } else if (openCount > 0 && avgDays >= 60) {
    parts.push("No compliance activity on file.");
  } else if (openCount === 0 && totalCount > 0) {
    parts.push("No current enforcement pressure.");
  } else if (openCount > 0) {
    parts.push("Low enforcement pressure. Early stage monitoring.");
  }

  // Don't push label into parts — sanitizer handles label placement
  const label = getLabel();
  const bodyText = parts.join(" ");
  return sanitizeInsightForStorage(bodyText, label) ?? bodyText;
}

function isCleanBrief(text: string, prop: Record<string, any>): boolean {
  if (prop.address && text.toLowerCase().includes(prop.address.toLowerCase().slice(0, 10))) return false;
  if (/[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}/.test(text)) return false;
  if (/Noted:|Case\s+(create|number|#)/i.test(text)) return false;
  if (/IPMC\s+\d/i.test(text)) return false;
  if (/\(\d{3}\)\s?\d{3}|\d{3}[\-.]\d{3}[\-.]\d{4}|@\w+\.\w+/.test(text)) return false;
  if (text.length < 40) return false;
  return true;
}

async function generateViaAzure(prop: Record<string, any>, azureConfig: AzureConfig): Promise<string | null> {
    const openCount = prop.open_violations ?? 0;
    const actionLabel =
      openCount === 0
        ? "PASS"
        : prop.enforcement_type === "water_shutoff" || prop.escalated || (prop.snap_score ?? 0) >= 70
          ? "CALL NOW"
          : (prop.snap_score ?? 0) >= 40 || openCount >= 2 || prop.repeat_offender || prop.multi_department
            ? "WORTH A CALL"
            : "OPPORTUNITY";

  const azureUrl = `${azureConfig.endpoint.replace(/\/+$/, "")}/openai/deployments/${azureConfig.deployment}/chat/completions?api-version=2024-08-01-preview`;
  const retryDelaysMs = [1000, 2000, 4000];

  try {
    let response: Response | null = null;

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
      response = await fetch(azureUrl, {
        method: "POST",
        headers: {
          "api-key": azureConfig.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: DEAL_STRATEGIST_PROMPT },
            { role: "user", content: formatPropertyForPrompt(prop) },
          ],
          max_completion_tokens: 400,
          temperature: 0.4,
        }),
      });

      if (response.ok) break;

      const retryable = response.status === 429 || response.status >= 500;
      const body = await response.text().catch(() => "");
      if (!retryable) {
        console.error(`[bulk-regen] Azure ${response.status}: ${body.slice(0, 300)}`);
        return null;
      }

      const isLast = attempt === retryDelaysMs.length - 1;
      console.warn(`[bulk-regen] Azure ${response.status} (attempt ${attempt + 1}/${retryDelaysMs.length})${isLast ? " — giving up" : ` — retrying in ${retryDelaysMs[attempt]}ms`}`);
      if (isLast) return null;
      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
    }

    if (!response?.ok) return null;

    const result = await response.json();
    let text = sanitizeInsightForStorage(result?.choices?.[0]?.message?.content?.trim() || null, actionLabel);
    if (!text) return null;
    text = text.replace(/\s*[—–-]\s*/g, ". ").replace(/\.\.\s/g, ". ").replace(/\.\s\./g, ".");
    text = sanitizeInsightForStorage(text, actionLabel);
    if (!text || !isCleanBrief(text, prop)) return null;
    return text;
  } catch (err) {
    console.error("[bulk-regen] Azure error:", err);
    return null;
  }
}

const LABEL_REGEX = /(CALL NOW|WORTH A CALL|OPPORTUNITY|PASS)\s*\.?\s*$/;
const LEGACY_LABEL_MAP: Record<string, string> = {
  "WATCH": "OPPORTUNITY",
  "MONITOR": "OPPORTUNITY",
  "LOW PRIORITY": "OPPORTUNITY",
  "WATCH/PASS": "OPPORTUNITY",
  "GOOD OPPORTUNITY": "WORTH A CALL",
  "HIGH OPPORTUNITY": "CALL NOW",
};

async function handleFixLabels(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  azureConfig: AzureConfig | null,
  totalProcessed: number,
  autoResume: boolean,
  subPhase: string,
  headers: Record<string, string>,
): Promise<Response> {
  const FIX_BATCH = 500;

  // Phase 1: Find properties with legacy labels (WATCH, MONITOR, etc.)
  const legacyLabels = Object.keys(LEGACY_LABEL_MAP);
  const legacyPattern = legacyLabels.map(l => l.replace("/", "\\/")).join("|");

  // Use RPC or direct query to find and fix legacy labels
  // Fetch properties that have legacy labels in snap_insight
  const { data: legacyProps, error: legacyErr } = await supabase
    .from("properties")
    .select("id, snap_insight")
    .not("snap_insight", "is", null)
    .or(legacyLabels.map(l => `snap_insight.ilike.%${l}`).join(","))
    .range(0, FIX_BATCH - 1);

  let fixedCount = 0;

  if (!legacyErr && legacyProps && legacyProps.length > 0) {
    for (const prop of legacyProps) {
      const insight = prop.snap_insight as string;
      let newInsight = insight;

      for (const [legacy, replacement] of Object.entries(LEGACY_LABEL_MAP)) {
        const regex = new RegExp(`\\n\\n${legacy.replace("/", "\\/")}\\s*\\.?\\s*$`, "i");
        if (regex.test(newInsight)) {
          newInsight = newInsight.replace(regex, `\n\n${replacement}`);
          break;
        }
        // Also check if it ends with the label without double newline
        const endRegex = new RegExp(`\\s+${legacy.replace("/", "\\/")}\\s*\\.?\\s*$`, "i");
        if (endRegex.test(newInsight)) {
          newInsight = newInsight.replace(endRegex, `\n\n${replacement}`);
          break;
        }
      }

      // Also strip trailing periods from valid labels
      newInsight = newInsight.replace(/\n\n(CALL NOW|WORTH A CALL|OPPORTUNITY|PASS)\.\s*$/, "\n\n$1");

      if (newInsight !== insight) {
        const { error } = await supabase
          .from("properties")
          .update({ snap_insight: newInsight })
          .eq("id", prop.id);
        if (!error) fixedCount++;
      }
    }

    const newTotal = totalProcessed + fixedCount;
    console.log(`[bulk-regen] fix-labels: normalized ${fixedCount} legacy labels. Total: ${newTotal}`);

    if (autoResume && legacyProps.length === FIX_BATCH) {
      scheduleResume(supabaseUrl, serviceKey, newTotal, "fix-labels", "legacy");
      return new Response(JSON.stringify({ success: true, fixedCount, totalProcessed: newTotal, hasMore: true, phase: "legacy-labels" }), { headers });
    }
  }

  // Phase 2a: Quick rule-based PASS for properties with NO open violations and missing labels
  if (subPhase === "" || subPhase === "closed-pass") {
    const { data: closedProps, error: clErr } = await supabase
      .from("properties")
      .select("id, address, city, state, zip, county, snap_score, snap_insight, distress_signals, violation_types, open_violations, total_violations, enforcement_type, escalated, repeat_offender, multi_department, avg_days_open, oldest_violation_date, newest_violation_date, opportunity_class")
      .not("snap_insight", "is", null)
      .neq("snap_insight", "")
      .not("snap_insight", "ilike", "%CALL NOW%")
      .not("snap_insight", "ilike", "%WORTH A CALL%")
      .not("snap_insight", "ilike", "%OPPORTUNITY%")
      .not("snap_insight", "ilike", "%PASS%")
      .or("open_violations.is.null,open_violations.eq.0")
      .range(0, FIX_BATCH - 1);

    if (!clErr && closedProps && closedProps.length > 0) {
      let passCount = 0;
      for (const prop of closedProps) {
        const brief = generateRuleBrief(prop);
        const briefJson = {
          brief_text: brief,
          generated_at: new Date().toISOString(),
          model: "deterministic-v5",
          version: REGEN_VERSION + "-closed-pass",
        };
        const { error } = await supabase
          .from("properties")
          .update({ snap_insight: brief, investor_insight_brief: briefJson, last_analyzed_at: new Date().toISOString() })
          .eq("id", prop.id);
        if (!error) passCount++;
      }

      const newTotal = totalProcessed + fixedCount + passCount;
      console.log(`[bulk-regen] fix-labels/closed-pass: ${passCount} closed properties → rule-based. Total: ${newTotal}`);

      if (autoResume && closedProps.length === FIX_BATCH) {
        scheduleResume(supabaseUrl, serviceKey, newTotal, "fix-labels", "closed-pass");
        return new Response(JSON.stringify({ success: true, passCount, totalProcessed: newTotal, hasMore: true, phase: "closed-pass" }), { headers });
      }

      // If fewer than batch size, closed phase done — fall through to open phase
      totalProcessed = newTotal;
    }
  }

  // Phase 2b: Azure AI briefs for properties WITH open violations and missing labels
  const AI_BATCH = 100;
  const { data: openProps, error: opErr } = await supabase
    .from("properties")
    .select("id, address, city, state, zip, county, snap_score, snap_insight, distress_signals, violation_types, open_violations, total_violations, enforcement_type, escalated, repeat_offender, multi_department, avg_days_open, oldest_violation_date, newest_violation_date, opportunity_class")
    .not("snap_insight", "is", null)
    .neq("snap_insight", "")
    .not("snap_insight", "ilike", "%CALL NOW%")
    .not("snap_insight", "ilike", "%WORTH A CALL%")
    .not("snap_insight", "ilike", "%OPPORTUNITY%")
    .not("snap_insight", "ilike", "%PASS%")
    .gt("open_violations", 0)
    .order("snap_score", { ascending: false, nullsFirst: false })
    .range(0, AI_BATCH - 1);

  if (opErr) {
    console.error("[bulk-regen] fix-labels/open-ai fetch error:", opErr);
    return new Response(JSON.stringify({ error: opErr.message }), { status: 500, headers });
  }

  if (!openProps || openProps.length === 0) {
    const finalTotal = totalProcessed + fixedCount;
    console.log(`[bulk-regen] ✅ fix-labels ALL DONE! Total processed: ${finalTotal}`);
    return new Response(JSON.stringify({ success: true, done: true, totalProcessed: finalTotal, message: "All labels fixed!" }), { headers });
  }

  let aiCount = 0;
  let ruleCount = 0;

  if (azureConfig) {
    // Use Azure AI for high-quality briefs
    for (let i = 0; i < openProps.length; i += AI_CONCURRENCY) {
      const chunk = openProps.slice(i, i + AI_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (prop) => ({
          id: prop.id,
          prop,
          brief: await generateViaAzure(prop, azureConfig),
        })),
      );

      for (const result of results) {
        const brief = result.brief || generateRuleBrief(result.prop); // fallback to rule-based
        const isAI = !!result.brief;
        const briefJson = {
          brief_text: brief,
          generated_at: new Date().toISOString(),
          model: isAI ? "azure-openai" : "deterministic-v5",
          version: REGEN_VERSION + "-label-fix-open",
        };
        const { error } = await supabase
          .from("properties")
          .update({ snap_insight: brief, investor_insight_brief: briefJson, last_analyzed_at: new Date().toISOString() })
          .eq("id", result.id);
        if (!error) { if (isAI) aiCount++; else ruleCount++; }
      }

      if (i + AI_CONCURRENCY < openProps.length) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  } else {
    // No Azure config — fallback to rule-based for all
    for (const prop of openProps) {
      const brief = generateRuleBrief(prop);
      const briefJson = {
        brief_text: brief,
        generated_at: new Date().toISOString(),
        model: "deterministic-v5",
        version: REGEN_VERSION + "-label-fix-open-rule",
      };
      const { error } = await supabase
        .from("properties")
        .update({ snap_insight: brief, investor_insight_brief: briefJson, last_analyzed_at: new Date().toISOString() })
        .eq("id", prop.id);
      if (!error) ruleCount++;
    }
  }

  const newTotal = totalProcessed + fixedCount + aiCount + ruleCount;
  console.log(`[bulk-regen] fix-labels/open: ${aiCount} AI + ${ruleCount} rule-based. Total: ${newTotal}`);

  if (autoResume && openProps.length === AI_BATCH) {
    const resumeDelay = aiCount === 0 && ruleCount === 0 ? 30000 : 1000;
    scheduleResume(supabaseUrl, serviceKey, newTotal, "fix-labels", "open-ai", resumeDelay);
  }

  return new Response(JSON.stringify({
    success: true,
    fixedCount,
    aiCount,
    ruleCount,
    totalProcessed: newTotal,
    hasMore: openProps.length === AI_BATCH,
    phase: "open-ai",
    autoResuming: autoResume,
  }), { headers });
}

function scheduleResume(supabaseUrl: string, serviceKey: string, totalProcessed: number, mode: string, subPhase: string, delay = 500) {
  const continueTask = async () => {
    await new Promise(r => setTimeout(r, delay));
    try {
      await fetch(`${supabaseUrl}/functions/v1/bulk-regenerate-briefs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ autoResume: true, totalProcessed, version: REGEN_VERSION, mode, subPhase }),
      });
    } catch (err) {
      console.error(`[bulk-regen] ${mode}/${subPhase} resume failed:`, err);
    }
  };
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(continueTask()); else continueTask().catch(console.error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AZURE_OPENAI_API_KEY = Deno.env.get("AZURE_OPENAI_API_KEY") || "";
    const AZURE_OPENAI_ENDPOINT = Deno.env.get("AZURE_OPENAI_ENDPOINT") || "";
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get("AZURE_OPENAI_DEPLOYMENT") || "";

    const azureConfig = AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_DEPLOYMENT
      ? { apiKey: AZURE_OPENAI_API_KEY, endpoint: AZURE_OPENAI_ENDPOINT, deployment: AZURE_OPENAI_DEPLOYMENT }
      : null;

    const { autoResume = true, totalProcessed = 0, version = "", mode = "ai", subPhase = "" } = await req.json().catch(() => ({}));

    if (version && version !== REGEN_VERSION) {
      console.log(`[bulk-regen] Stopping old chain (version: ${version})`);
      return new Response(JSON.stringify({ stopped: true, reason: "version_mismatch" }), { headers });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── MODE: fix-labels ── Normalize legacy labels & regenerate missing-label briefs
    if (mode === "fix-labels") {
      return await handleFixLabels(supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, azureConfig, totalProcessed, autoResume, subPhase, headers);
    }

    const batchSize = mode === "ai" ? BATCH_SIZE_AI : BATCH_SIZE_RULE;

    // Target properties with rule-based briefs (deterministic-v5) for AI upgrade
    let query = supabase
      .from("properties")
      .select("id, address, city, state, zip, county, snap_score, distress_signals, violation_types, open_violations, total_violations, enforcement_type, escalated, repeat_offender, multi_department, avg_days_open, oldest_violation_date, newest_violation_date, opportunity_class")
      .filter("investor_insight_brief->>model", "eq", "deterministic-v5");

    if (mode === "rule") {
      // Rule mode: fallback only
      query = query.or("snap_score.is.null,snap_score.lt.70");
    }
    // AI mode: process ALL properties missing briefs (no score filter)

    const { data: properties, error: fetchErr } = await query
      .order("snap_score", { ascending: mode === "rule", nullsFirst: mode === "rule" })
      .range(0, batchSize - 1);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!properties || properties.length === 0) {
      if (mode === "ai") {
        console.log(`[bulk-regen] ✅ AI phase done! Total: ${totalProcessed}. Switching to rule-based mode...`);
        if (autoResume) {
          const continueTask = async () => {
            await new Promise((r) => setTimeout(r, 500));
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/bulk-regenerate-briefs`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
                body: JSON.stringify({ autoResume: true, totalProcessed, version: REGEN_VERSION, mode: "rule" }),
              });
            } catch (err) {
              console.error("[bulk-regen] Mode switch failed:", err);
            }
          };
          const runtime = (globalThis as any).EdgeRuntime;
          if (runtime?.waitUntil) runtime.waitUntil(continueTask()); else continueTask().catch(console.error);
        }
        return new Response(JSON.stringify({ success: true, aiDone: true, totalProcessed, switchingToRule: true }), { headers });
      }

      console.log(`[bulk-regen] ✅ ALL DONE! Total processed: ${totalProcessed}`);
      return new Response(JSON.stringify({ success: true, done: true, totalProcessed, message: "All briefs regenerated!" }), { headers });
    }

    // Query already filters by mode, so assign directly
    const ruleProps = mode === "rule" ? properties : [];
    const aiProps = mode === "ai" ? properties : [];

    let batchSuccess = 0;
    let batchFailed = 0;
    let ruleCount = 0;
    let aiCount = 0;

    for (const prop of ruleProps) {
      const brief = generateRuleBrief(prop);
      const briefJson = {
        brief_text: brief,
        generated_at: new Date().toISOString(),
        model: "deterministic-v5",
        version: REGEN_VERSION,
      };
      const { error } = await supabase
        .from("properties")
        .update({ snap_insight: brief, investor_insight_brief: briefJson, last_analyzed_at: new Date().toISOString() })
        .eq("id", prop.id);
      if (error) batchFailed++; else { batchSuccess++; ruleCount++; }
    }

    if (aiProps.length > 0) {
      if (!azureConfig) {
        return new Response(JSON.stringify({ error: "Azure AI is not configured for bulk regeneration." }), {
          status: 500,
          headers,
        });
      }

      for (let i = 0; i < aiProps.length; i += AI_CONCURRENCY) {
        const chunk = aiProps.slice(i, i + AI_CONCURRENCY);
        const results = await Promise.all(
          chunk.map(async (prop) => ({
            id: prop.id,
            prop,
            brief: await generateViaAzure(prop, azureConfig),
          })),
        );

        const allFailed = results.every((result) => result.brief === null);
        if (allFailed && chunk.length > 0) {
          console.warn("[bulk-regen] ⚠️ Azure chunk fully failed — pausing before retry.");
          batchFailed += chunk.length;
          break;
        }

        for (const result of results) {
          if (!result.brief) {
            batchFailed++;
            console.warn(`[bulk-regen] Property ${result.id} — Azure failed, leaving for retry.`);
            continue;
          }

          const briefJson = {
            brief_text: result.brief,
            generated_at: new Date().toISOString(),
            model: "azure-openai",
            version: REGEN_VERSION,
          };

          const { error } = await supabase
            .from("properties")
            .update({
              snap_insight: result.brief,
              investor_insight_brief: briefJson,
              last_analyzed_at: new Date().toISOString(),
            })
            .eq("id", result.id);

          if (error) batchFailed++; else { batchSuccess++; aiCount++; }
        }

        if (i + AI_CONCURRENCY < aiProps.length) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    }

    const newTotal = totalProcessed + batchSuccess;
    console.log(`[bulk-regen] Batch: ${batchSuccess} ok (${ruleCount} rule, ${aiCount} AI), ${batchFailed} failed. Total: ${newTotal}`);

    const resumeDelay = batchFailed > batchSuccess ? 60000 : batchSuccess === 0 ? 30000 : 500;

    if (autoResume) {
      const continueTask = async () => {
        await new Promise((r) => setTimeout(r, resumeDelay));
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/bulk-regenerate-briefs`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ autoResume: true, totalProcessed: newTotal, version: REGEN_VERSION, mode }),
          });
        } catch (err) {
          console.error("[bulk-regen] Auto-resume failed:", err);
        }
      };
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(continueTask()); else continueTask().catch(console.error);
    }

    return new Response(JSON.stringify({
      success: true,
      batchSuccess,
      batchFailed,
      ruleCount,
      aiCount,
      totalProcessed: newTotal,
      hasMore: properties.length === batchSize,
      autoResuming: autoResume,
    }), { headers });

  } catch (error) {
    console.error("[bulk-regen] Fatal:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers,
    });
  }
});