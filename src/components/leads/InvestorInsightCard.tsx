import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw, AlertTriangle, Clock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/externalClient";

interface InvestorBrief {
  enforcement_summary: string;
  distress_indicators: string;
  recommended_action: string;
  generated_at: string;
  property_snap_score: number | null;
  newest_violation_date?: string | null;
}

interface InvestorInsightCardProps {
  propertyId: string;
  snapScore: number | null;
  snapInsight: string | null;
  opportunityClass: string | null;
  openViolations: number | null;
  distressSignals?: string[] | null;
  newestViolationDate?: string | null;
  cachedBrief: InvestorBrief | null;
  onBriefGenerated?: (brief: InvestorBrief) => void;
}

type CardState =
  | "loading"
  | "timeout"
  | "unscored"
  | "brief"
  | "fallback"
  | "rule_based"
  | "rate_limited"
  | "unavailable";

// ── Rule-based distress summary (5th fallback layer) ──
function buildRuleBasedSummary(
  distressSignals: string[] | null | undefined,
  openViolations: number | null,
  snapScore: number | null,
  opportunityClass: string | null
): { enforcement_summary: string; distress_indicators: string; recommended_action: string } | null {
  const signals = distressSignals || [];
  const violations = openViolations ?? 0;

  if (signals.length === 0 && violations === 0 && snapScore === null) {
    return null; // Truly no data
  }

  // Build enforcement summary
  const summaryParts: string[] = [];
  if (violations > 0) {
    summaryParts.push(`${violations} open violation${violations > 1 ? "s" : ""} on file`);
  }
  if (signals.includes("water_shutoff_enforcement") || signals.includes("maximum_enforcement_pressure") || signals.includes("active_enforcement_current") || signals.includes("compounding_enforcement") || signals.includes("direct_municipal_action")) {
    summaryParts.push("water shutoff enforcement active");
  }
  if (signals.includes("enforcement_escalation")) {
    summaryParts.push("enforcement escalated (condemned, legal, or court proceedings)");
  }
  if (signals.includes("fire_citation")) {
    summaryParts.push("fire safety violations present");
  }
  if (signals.includes("structural_citation")) {
    summaryParts.push("structural violations present");
  }
  if (signals.includes("vacancy_citation")) {
    summaryParts.push("vacancy or abandonment flagged");
  }
  if (signals.includes("extended_enforcement")) {
    summaryParts.push("violations open 180+ days");
  }

  const enforcement_summary = summaryParts.length > 0
    ? summaryParts.join(". ") + "."
    : violations > 0
      ? `${violations} violation${violations > 1 ? "s" : ""} on record.`
      : "Limited enforcement data available.";

  // Build distress indicators
  const SIGNAL_LABELS: Record<string, string> = {
    water_shutoff_enforcement: "Water shutoff — severe financial distress or vacancy",
    maximum_enforcement_pressure: "Maximum enforcement — water shutoff + violations + repeat offender",
    active_enforcement_current: "Active utility enforcement in progress",
    compounding_enforcement: "Water shutoff + open code violations — compounding pressure",
    enforcement_escalation: "Legal escalation — condemned, court, or board proceedings",
    extreme_enforcement_load: "200+ open violations — portfolio-level enforcement",
    massive_enforcement_load: "50-199 open violations — severe enforcement",
    high_violation_volume: "10-49 open violations — significant enforcement",
    coordinated_enforcement: "Multiple city departments involved",
    extended_enforcement: "Violations open 180+ days — long-standing issues",
    fire_citation: "Fire safety violations — major damage or hazard",
    structural_citation: "Structural violations — major repair costs",
    vacancy_citation: "Vacant or abandoned property",
    recent_activity: "Enforcement action within 7 days",
    current_enforcement: "Enforcement action within 30 days",
  };

  const distressParts = signals
    .filter((s) => SIGNAL_LABELS[s])
    .map((s) => SIGNAL_LABELS[s]);

  const distress_indicators = distressParts.length > 0
    ? distressParts.join(". ") + "."
    : snapScore !== null && snapScore >= 40
      ? "Elevated enforcement activity detected based on Snap Score."
      : "No high-priority distress signals flagged.";

  // Build recommended action
  let recommended_action: string;
  if (signals.includes("water_shutoff_enforcement") || signals.includes("maximum_enforcement_pressure") || (snapScore !== null && snapScore >= 70)) {
    recommended_action = "IMMEDIATE OUTREACH — High distress signals detected. Contact property owner.";
  } else if (snapScore !== null && snapScore >= 40) {
    recommended_action = "STRONG OPPORTUNITY — Elevated enforcement. Monitor for escalation or reach out.";
  } else if (violations > 0) {
    recommended_action = "MONITOR — Active violations present. Watch for changes.";
  } else {
    recommended_action = "MONITOR — Limited data. Check back as enforcement records update.";
  }

  return { enforcement_summary, distress_indicators, recommended_action };
}

export function InvestorInsightCard({
  propertyId,
  snapScore,
  snapInsight,
  opportunityClass,
  openViolations,
  distressSignals,
  newestViolationDate,
  cachedBrief,
  onBriefGenerated,
}: InvestorInsightCardProps) {
  const [brief, setBrief] = useState<InvestorBrief | null>(cachedBrief);
  const [state, setState] = useState<CardState>("loading");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [rateLimitMessage, setRateLimitMessage] = useState<string>("");
  const debounceRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const isCacheValid = useCallback((b: InvestorBrief): boolean => {
    const generated = new Date(b.generated_at).getTime();
    const now = Date.now();
    return now - generated < 24 * 60 * 60 * 1000; // 24 hours
  }, []);

  const scoreChanged = useCallback(
    (b: InvestorBrief): boolean => {
      if (snapScore === null || b.property_snap_score === null) return false;
      return Math.abs(snapScore - b.property_snap_score) > 5;
    },
    [snapScore]
  );

  // Check if new violations appeared since brief was generated
  const hasNewActivity = useCallback(
    (b: InvestorBrief): boolean => {
      const briefNewest = b.newest_violation_date;
      const currentNewest = newestViolationDate;
      if (!briefNewest || !currentNewest) return false;
      return new Date(currentNewest).getTime() > new Date(briefNewest).getTime();
    },
    [newestViolationDate]
  );

  const resolveToFallback = useCallback(() => {
    // Layer 3: snap_insight
    if (snapInsight) {
      setState("fallback");
      return;
    }
    // Layer 4: rule-based distress summary
    const ruleBased = buildRuleBasedSummary(distressSignals, openViolations, snapScore, opportunityClass);
    if (ruleBased) {
      setBrief({
        ...ruleBased,
        generated_at: new Date().toISOString(),
        property_snap_score: snapScore,
      });
      setState("rule_based");
      return;
    }
    // Layer 5: truly unavailable
    setState("unavailable");
  }, [snapInsight, distressSignals, openViolations, snapScore, opportunityClass]);

  const fetchBrief = useCallback(
    async (force = false) => {
      // Don't call if snap_score is null
      if (snapScore === null) {
        setState("unscored");
        return;
      }

      // Use cached brief if valid and not forcing
      if (!force && cachedBrief && isCacheValid(cachedBrief)) {
        setBrief(cachedBrief);
        setState("brief");
        return;
      }

      setState("loading");

      // Cancel any previous in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      // 10-second timeout
      const timeoutId = setTimeout(() => {
        if (abortRef.current) {
          abortRef.current.abort();
        }
        setState("timeout");
      }, 10000);

      try {
        const { data, error } = await supabase.functions.invoke(
          "generate-investor-brief",
          {
            body: { property_id: propertyId },
          }
        );

        clearTimeout(timeoutId);

        // Handle rate limiting
        if (data?.error === "rate_limit_exceeded") {
          setRateLimitMessage(data.message || "Daily limit reached. Try again tomorrow.");
          setState("rate_limited");
          return;
        }

        // Handle JWT expiry — redirect to login
        if (error && (error as any)?.status === 401) {
          console.warn("[InvestorInsightCard] JWT expired, redirecting to login");
          window.location.href = "/login";
          return;
        }

        if (error || data?.error) {
          console.error("[InvestorInsightCard] Edge function error:", error || data?.error);
          resolveToFallback();
          return;
        }

        const newBrief = data as InvestorBrief;
        setBrief(newBrief);
        setState("brief");
        onBriefGenerated?.(newBrief);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err?.name === "AbortError") return;
        console.error("[InvestorInsightCard] Fetch error:", err);
        resolveToFallback();
      }
    },
    [propertyId, snapScore, cachedBrief, isCacheValid, onBriefGenerated, resolveToFallback]
  );

  useEffect(() => {
    fetchBrief();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchBrief]);

  const handleRegenerate = useCallback(() => {
    const now = Date.now();
    if (now - debounceRef.current < 3000) return;
    debounceRef.current = now;
    setIsRegenerating(true);
    fetchBrief(true).finally(() => setIsRegenerating(false));
  }, [fetchBrief]);

  const getOpportunityBadgeClass = (opp: string | null) => {
    switch (opp) {
      case "distressed":
        return "bg-red-100 text-red-700 border-red-200";
      case "value_add":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "watch":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getScoreBadgeClass = (score: number | null) => {
    if (score === null) return "bg-slate-100 text-slate-600 border-slate-200";
    if (score >= 70) return "bg-red-100 text-red-700 border-red-200";
    if (score >= 40) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-blue-100 text-blue-700 border-blue-200";
  };

  // Extract the action label (e.g. "IMMEDIATE OUTREACH") from recommended_action
  const extractActionLabel = (action: string): { label: string; body: string } => {
    const match = action.match(
      /^\s*(IMMEDIATE OUTREACH|STRONG OPPORTUNITY|MONITOR|SKIP)\s*/i
    );
    if (match) {
      return {
        label: match[1].toUpperCase(),
        body: action.slice(match[0].length).replace(/^[—–\-]\s*/, "").trim(),
      };
    }
    return { label: "", body: action };
  };

  // ── Unscored state ──
  if (state === "unscored") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
      >
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-500">
            This property hasn't been scored yet. Run scoring first to generate
            an Investor Insight brief.
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Loading skeleton ──
  if (state === "loading") {
    return (
      <div className="rounded-xl border border-indigo-200/50 bg-indigo-50/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
          <Skeleton className="h-4 w-32" />
          <div className="ml-auto flex gap-1.5">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <div className="pt-2 border-t border-indigo-100">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3 mt-1.5" />
        </div>
        <div className="pt-2 border-t border-indigo-100">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2 mt-1.5" />
        </div>
      </div>
    );
  }

  // ── Timeout ──
  if (state === "timeout") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-4"
      >
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-amber-700">
              Brief is taking longer than usual. Please try again.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="mt-2 text-xs text-amber-600 hover:text-amber-700 min-w-[44px] min-h-[44px] px-3"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Rate limited ──
  if (state === "rate_limited") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-4"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-xs font-medium text-amber-900 mb-1">
              Regeneration Limit Reached
            </div>
            <p className="text-sm text-amber-800 leading-relaxed">
              {rateLimitMessage}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Fallback to snap_insight (with retry link) ──
  if (state === "fallback") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-4"
      >
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-amber-900 mb-1">
                Cached Insight (AI temporarily unavailable)
              </div>
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="text-xs text-amber-600 hover:text-amber-800 underline underline-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                {isRegenerating ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  "Retry"
                )}
              </button>
            </div>
            <p className="text-sm text-amber-800 leading-relaxed">
              {snapInsight}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Rule-based fallback (no AI, no snap_insight, but we have signals) ──
  if (state === "rule_based" && brief) {
    const { label: rbActionLabel, body: rbActionBody } = extractActionLabel(brief.recommended_action);
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-300/70 bg-gradient-to-b from-slate-50/60 to-white p-4 space-y-3"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">
              Investor Insight
            </span>
            <span className="text-[10px] font-medium text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
              Auto
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {snapScore !== null && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getScoreBadgeClass(snapScore)}`}>
                Score: {snapScore}
              </span>
            )}
            {opportunityClass && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${getOpportunityBadgeClass(opportunityClass)}`}>
                {opportunityClass.replace("_", " ")}
              </span>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="pt-1">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Enforcement Summary
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{brief.enforcement_summary}</p>
        </div>

        {/* Distress */}
        <div className="pt-2 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Distress Indicators
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{brief.distress_indicators}</p>
        </div>

        {/* Action */}
        <div className="pt-2 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Recommended Action
          </div>
          <div>
            {rbActionLabel && (
              <span className="inline-block text-xs font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded mb-1">
                {rbActionLabel}
              </span>
            )}
            <p className="text-sm text-slate-700 leading-relaxed">{rbActionBody}</p>
          </div>
        </div>

        {/* Footer with retry */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Rule-based summary (AI unavailable)
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="text-xs text-slate-500 hover:text-slate-700 min-w-[44px] min-h-[44px] px-3"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`} />
            Try AI
          </Button>
        </div>
      </motion.div>
    );
  }

  // ── Unavailable ──
  if (state === "unavailable") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
      >
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-500">
            Investor Insight unavailable for this property.
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Brief display ──
  if (!brief) return null;

  const { label: actionLabel, body: actionBody } = extractActionLabel(
    brief.recommended_action
  );
  const showScoreWarning = scoreChanged(brief);
  const showNewActivityWarning = !showScoreWarning && hasNewActivity(brief);
  const isCached = cachedBrief && isCacheValid(cachedBrief) && !isRegenerating;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-indigo-200/70 bg-gradient-to-b from-indigo-50/60 to-white p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold text-indigo-900">
            Investor Insight
          </span>
          <span className="text-[10px] font-medium text-indigo-400 bg-indigo-100 px-1.5 py-0.5 rounded">
            AI
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {snapScore !== null && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getScoreBadgeClass(snapScore)}`}
            >
              Score: {snapScore}
            </span>
          )}
          {opportunityClass && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${getOpportunityBadgeClass(opportunityClass)}`}
            >
              {opportunityClass.replace("_", " ")}
            </span>
          )}
          {openViolations !== null && openViolations > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-orange-100 text-orange-700 border-orange-200">
              {openViolations} open
            </span>
          )}
        </div>
      </div>

      {/* Score change warning */}
      {showScoreWarning && (
        <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />
          <span className="text-xs text-yellow-700">
            Score has changed since this brief was generated — click Regenerate
          </span>
        </div>
      )}

      {/* New activity warning */}
      {showNewActivityWarning && (
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
          <Activity className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
          <span className="text-xs text-blue-700">
            New violation activity since this brief was generated — click Regenerate for updated analysis
          </span>
        </div>
      )}

      {/* Enforcement Summary */}
      <div className="pt-1">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Enforcement Summary
        </div>
        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
          {brief.enforcement_summary}
        </p>
      </div>

      {/* Distress Indicators */}
      <div className="pt-2 border-t border-indigo-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Distress Indicators
        </div>
        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
          {brief.distress_indicators}
        </p>
      </div>

      {/* Recommended Action */}
      <div className="pt-2 border-t border-indigo-100">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Recommended Action
        </div>
        <div>
          {actionLabel && (
            <span className="inline-block text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded mb-1">
              {actionLabel}
            </span>
          )}
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
            {actionBody}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-indigo-100 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {isCached ? "Cached Insight" : "Generated"}{" "}
          {new Date(brief.generated_at).toLocaleString()}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="text-xs text-indigo-500 hover:text-indigo-700 min-w-[44px] min-h-[44px] px-3"
        >
          <RefreshCw
            className={`h-3 w-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`}
          />
          Regenerate
        </Button>
      </div>
    </motion.div>
  );
}
