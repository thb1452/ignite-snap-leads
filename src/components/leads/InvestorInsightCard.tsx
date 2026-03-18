import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/externalClient";

interface InvestorBrief {
  enforcement_summary: string;
  distress_indicators: string;
  recommended_action: string;
  generated_at: string;
  property_snap_score: number | null;
}

interface InvestorInsightCardProps {
  propertyId: string;
  snapScore: number | null;
  snapInsight: string | null;
  opportunityClass: string | null;
  openViolations: number | null;
  cachedBrief: InvestorBrief | null;
  onBriefGenerated?: (brief: InvestorBrief) => void;
}

type CardState =
  | "loading"
  | "timeout"
  | "unscored"
  | "brief"
  | "fallback"
  | "unavailable";

export function InvestorInsightCard({
  propertyId,
  snapScore,
  snapInsight,
  opportunityClass,
  openViolations,
  cachedBrief,
  onBriefGenerated,
}: InvestorInsightCardProps) {
  const [brief, setBrief] = useState<InvestorBrief | null>(cachedBrief);
  const [state, setState] = useState<CardState>("loading");
  const [isRegenerating, setIsRegenerating] = useState(false);
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

        if (error || data?.error) {
          console.error("[InvestorInsightCard] Edge function error:", error || data?.error);
          // Fallback to snap_insight
          if (snapInsight) {
            setState("fallback");
          } else {
            setState("unavailable");
          }
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
        if (snapInsight) {
          setState("fallback");
        } else {
          setState("unavailable");
        }
      }
    },
    [propertyId, snapScore, snapInsight, cachedBrief, isCacheValid, onBriefGenerated]
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
        body: action.slice(match[0].length).trim(),
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
              className="mt-2 text-xs text-amber-600 hover:text-amber-700 px-2 h-7"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isRegenerating ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Fallback to snap_insight ──
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
            <div className="text-xs font-medium text-amber-900 mb-1">
              Cached Insight (AI temporarily unavailable)
            </div>
            <p className="text-sm text-amber-800 leading-relaxed">
              {snapInsight}
            </p>
          </div>
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
          className="text-xs text-indigo-500 hover:text-indigo-700 px-2 h-7"
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
