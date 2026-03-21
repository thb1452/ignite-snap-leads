import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw, AlertTriangle, Clock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/externalClient";

interface InvestorBrief {
  brief_text: string;
  enforcement_summary?: string;
  distress_indicators?: string;
  recommended_action?: string;
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
): { brief_text: string } | null {
  const signals = distressSignals || [];
  const violations = openViolations ?? 0;

  if (signals.length === 0 && violations === 0 && snapScore === null) {
    return null;
  }

  const parts: string[] = [];

  if (violations > 0) {
    parts.push(`This property has ${violations} open violation${violations > 1 ? "s" : ""} on file`);
  } else {
    parts.push("Limited enforcement data available for this property");
  }

  const highDistress = signals.includes("water_shutoff_enforcement") || signals.includes("maximum_enforcement_pressure");
  const hasEscalation = signals.includes("enforcement_escalation");
  const hasStructural = signals.includes("structural_citation");
  const hasFire = signals.includes("fire_citation");
  const hasVacancy = signals.includes("vacancy_citation");

  if (highDistress) {
    parts[0] += " including an active water shutoff.";
    parts.push("Utility disconnection on record — severe distress signal with no compliance activity on file.");
  } else {
    parts[0] += ".";
    const signalDescriptions: string[] = [];
    if (hasStructural) signalDescriptions.push("structural violations");
    if (hasFire) signalDescriptions.push("fire safety violations");
    if (hasVacancy) signalDescriptions.push("vacancy indicators");
    if (signals.includes("extended_enforcement")) signalDescriptions.push("violations open 180+ days");
    if (signalDescriptions.length > 0) {
      parts.push(`Distress signals include ${signalDescriptions.join(", ")}.`);
    } else if (snapScore !== null && snapScore >= 40) {
      parts.push("Elevated enforcement activity detected based on Snap Score.");
    }
  }

  if (hasEscalation) {
    parts.push("Enforcement has escalated to condemned, legal, or court proceedings.");
  }

  if (highDistress || (snapScore !== null && snapScore >= 70)) {
    parts.push("**CALL NOW** — high distress signals detected, act now.");
  } else if (snapScore !== null && snapScore >= 40) {
    parts.push("**WORTH A CALL** — elevated enforcement, worth investigating.");
  } else if (violations > 0) {
    parts.push("**WATCH** — active violations present, monitor for changes.");
  } else {
    parts.push("**WATCH** — limited data, check back as enforcement records update.");
  }

  return { brief_text: parts.join(" ") };
}

function getActionLabel(text: string): { label: string; colorClass: string } | null {
  if (/CALL NOW/i.test(text)) return { label: "CALL NOW", colorClass: "text-red-500 font-bold" };
  if (/WORTH A CALL/i.test(text)) return { label: "WORTH A CALL", colorClass: "text-orange-400 font-bold" };
  if (/WATCH/i.test(text)) return { label: "WATCH", colorClass: "text-gray-400 font-bold" };
  return null;
}

function stripActionLabel(text: string): string {
  return text
    .replace(/\*?\*?(CALL NOW|WORTH A CALL|WATCH)\*?\*?\.?/gi, "")
    .replace(/\*\*/g, "")
    .trim();
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
    return now - generated < 24 * 60 * 60 * 1000;
  }, []);

  const scoreChanged = useCallback(
    (b: InvestorBrief): boolean => {
      if (snapScore === null || b.property_snap_score === null) return false;
      return Math.abs(snapScore - b.property_snap_score) > 5;
    },
    [snapScore]
  );

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
    if (snapInsight) {
      setState("fallback");
      return;
    }
    const ruleBased = buildRuleBasedSummary(distressSignals, openViolations, snapScore, opportunityClass);
    if (ruleBased) {
      setBrief({
        brief_text: ruleBased.brief_text,
        generated_at: new Date().toISOString(),
        property_snap_score: snapScore,
      });
      setState("rule_based");
      return;
    }
    setState("unavailable");
  }, [snapInsight, distressSignals, openViolations, snapScore, opportunityClass]);

  const fetchBrief = useCallback(
    async (force = false) => {
      if (snapScore === null) {
        setState("unscored");
        return;
      }

      if (!force && cachedBrief && isCacheValid(cachedBrief)) {
        setBrief(cachedBrief);
        setState("brief");
        return;
      }

      setState("loading");

      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

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

        if (data?.error === "rate_limit_exceeded") {
          setRateLimitMessage(data.message || "Daily limit reached. Try again tomorrow.");
          setState("rate_limited");
          return;
        }

        if (error && (error as any)?.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (error || data?.error) {
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

  const getBriefDisplayText = (b: InvestorBrief): string => {
    if (b.brief_text) return b.brief_text;
    const parts = [b.enforcement_summary, b.distress_indicators, b.recommended_action].filter(Boolean);
    return parts.join(" ");
  };

  const renderBriefContent = (text: string) => {
    const actionLabel = getActionLabel(text);
    const body = stripActionLabel(text);
    return (
      <p className="text-sm text-slate-300 leading-relaxed">
        {body}{" "}
        {actionLabel && (
          <span className={actionLabel.colorClass}>{actionLabel.label}.</span>
        )}
      </p>
    );
  };

  // ── Unscored state ──
  if (state === "unscored") {
    return (
      <div className="bg-slate-900 rounded-xl p-4 border border-teal-500/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
        </div>
        <p className="text-sm text-slate-400">
          This property hasn't been scored yet. Run scoring first to generate an Investor Insight brief.
        </p>
      </div>
    );
  }

  // ── Loading skeleton ──
  if (state === "loading") {
    return (
      <div className="bg-slate-900 rounded-xl p-4 border border-teal-500/20 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-400 animate-pulse" />
          <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
        </div>
        <Skeleton className="h-3 w-full bg-slate-700" />
        <Skeleton className="h-3 w-full bg-slate-700" />
        <Skeleton className="h-3 w-4/5 bg-slate-700" />
      </div>
    );
  }

  // ── Timeout ──
  if (state === "timeout") {
    return (
      <div className="bg-slate-900 rounded-xl p-4 border border-teal-500/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
        </div>
        <p className="text-sm text-slate-400">Brief is taking longer than usual.</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="mt-2 text-xs text-teal-400 hover:text-teal-300 min-w-[44px] min-h-[44px] px-3"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`} />
          Retry
        </Button>
      </div>
    );
  }

  // ── Rate limited ──
  if (state === "rate_limited") {
    return (
      <div className="bg-slate-900 rounded-xl p-4 border border-teal-500/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
        </div>
        <p className="text-sm text-slate-400">{rateLimitMessage}</p>
      </div>
    );
  }

  // ── Fallback to snap_insight (NO "Cached Insight" warning) ──
  if (state === "fallback") {
    return (
      <div className="bg-slate-900 rounded-xl p-4 border border-teal-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-4 w-4 text-teal-400" />
            <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="text-xs text-teal-400 hover:text-teal-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {isRegenerating ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              "Retry"
            )}
          </button>
        </div>
        {renderBriefContent(snapInsight || "")}
      </div>
    );
  }

  // ── Rule-based fallback ──
  if (state === "rule_based" && brief) {
    return (
      <div className="bg-slate-900 rounded-xl p-4 border border-teal-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-4 w-4 text-teal-400" />
            <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="text-xs text-teal-400 hover:text-teal-300 min-w-[44px] min-h-[44px] px-3"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`} />
            Try AI
          </Button>
        </div>
        {renderBriefContent(getBriefDisplayText(brief))}
      </div>
    );
  }

  // ── Unavailable ──
  if (state === "unavailable") {
    return (
      <div className="bg-slate-900 rounded-xl p-4 border border-teal-500/20">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
        </div>
        <p className="text-sm text-slate-400">Investor Insight unavailable for this property.</p>
      </div>
    );
  }

  // ── Brief display ──
  if (!brief) return null;

  const displayText = getBriefDisplayText(brief);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 rounded-xl p-4 border border-teal-500/20 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="text-xs text-teal-400 hover:text-teal-300 min-w-[44px] min-h-[44px] px-3"
        >
          <RefreshCw
            className={`h-3 w-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`}
          />
          Regenerate
        </Button>
      </div>

      {/* Brief text */}
      {renderBriefContent(displayText)}
    </motion.div>
  );
}
