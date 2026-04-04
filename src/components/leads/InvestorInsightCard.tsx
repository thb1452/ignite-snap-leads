import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

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

// ── Action label utilities (shared with PropertyCard etc.) ──

import { getActionLabel, stripActionLabel } from "@/utils/actionLabelUtils";

// ── Rule-based distress summary (fallback when no AI brief exists) ──
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

// ── Brief text renderer with action label colors ──
function renderBriefText(text: string) {
  const cleaned = stripActionLabel(text);
  const actionLabel = getActionLabel(text);

  return (
    <div className="text-sm text-gray-200 leading-relaxed">
      <p>{cleaned}</p>
      {actionLabel && (
        <p className={`mt-1 ${actionLabel.colorClass}`}>{actionLabel.label}</p>
      )}
    </div>
  );
}

function getBriefDisplayText(b: InvestorBrief): string {
  if (b.brief_text) return b.brief_text;
  const parts = [b.enforcement_summary, b.distress_indicators, b.recommended_action].filter(Boolean);
  return parts.join(" ");
}

/**
 * InvestorInsightCard — DISPLAY ONLY
 *
 * Shows the pre-generated AI investor brief from the database.
 * No on-demand AI calls. Briefs are populated via bulk backfill.
 *
 * Fallback chain:
 *   1. cachedBrief (investor_insight_brief JSONB column)
 *   2. snap_insight (text column)
 *   3. Rule-based summary from distress signals
 *   4. "Brief pending" message
 */
export function InvestorInsightCard({
  snapScore,
  snapInsight,
  openViolations,
  distressSignals,
  cachedBrief,
}: InvestorInsightCardProps) {

  // Determine which text to display
  let displayText: string | null = null;

  if (cachedBrief) {
    displayText = getBriefDisplayText(cachedBrief);
  } else if (snapInsight) {
    displayText = snapInsight;
  } else {
    displayText = buildRuleBasedSummary(distressSignals, openViolations, snapScore);
  }

  // Nothing at all — show queued message
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
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-teal-400" />
        <span className="text-sm font-semibold text-teal-400">AI Investor Brief</span>
      </div>

      {/* Brief text */}
      {renderBriefText(displayText)}
    </motion.div>
  );
}
