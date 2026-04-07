import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import {
  getCompleteBriefText,
  getDisplayActionLabel,
  getFallbackActionLabel,
  stripActionLabel,
  type ActionLabel,
} from "@/utils/actionLabelUtils";

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

function buildRuleBasedSummary(
  distressSignals: string[] | null | undefined,
  openViolations: number | null,
  snapScore: number | null,
): string | null {
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
    parts.push("CALL NOW");
  } else if (snapScore !== null && snapScore >= 40) {
    parts.push("WORTH A CALL");
  } else {
    parts.push("WATCH");
  }

  return parts.join(" ");
}

function renderBriefText(text: string, fallbackActionLabel: ActionLabel) {
  const cleaned = getCompleteBriefText(text) || stripActionLabel(text).replace(/\s+/g, " ").trim() || text.trim();
  const actionLabel = getDisplayActionLabel(text, {
    snapScore: fallbackActionLabel.label === "CALL NOW" ? 90 : fallbackActionLabel.label === "WORTH A CALL" ? 70 : 0,
  });

  return (
    <div className="text-sm text-slate-300 leading-relaxed">
      <p className="break-words whitespace-pre-line">{cleaned}</p>
      <p className={`mt-2 ${actionLabel.colorClass}`}>{actionLabel.label}</p>
    </div>
  );
}

function getBriefDisplayText(b: InvestorBrief): string {
  if (b.brief_text) return b.brief_text;
  const parts = [b.enforcement_summary, b.distress_indicators, b.recommended_action].filter(Boolean);
  return parts.join(" ");
}

export function InvestorInsightCard({
  snapScore,
  snapInsight,
  openViolations,
  distressSignals,
  cachedBrief,
}: InvestorInsightCardProps) {
  const fallbackActionLabel = getFallbackActionLabel({
    snapScore,
    openViolations,
    distressSignals,
  });

  let displayText: string | null = null;

  if (cachedBrief) {
    displayText = getBriefDisplayText(cachedBrief);
  } else if (snapInsight) {
    displayText = snapInsight;
  } else {
    displayText = buildRuleBasedSummary(distressSignals, openViolations, snapScore);
  }

  if (!displayText) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-slate-700 bg-slate-900 p-3"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
        </div>
        <p className="text-sm text-slate-400 mt-2">
          Brief pending — this property will be analyzed in the next batch run.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-teal-400" />
        <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
      </div>

      {renderBriefText(displayText, fallbackActionLabel)}
    </motion.div>
  );
}
