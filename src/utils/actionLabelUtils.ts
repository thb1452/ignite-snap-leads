/**
 * Shared action label parsing for AI investor briefs.
 * Extracts the label, strips it from body text, and supports sentence-safe previews.
 */

const ACTION_LABEL_LINE_REGEX =
  /\n?\s*\n?\s*\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\s*\*?\*?\s*$/i;

const ACTION_LABELS_REGEX =
  /\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\*?\*?/gi;

const SENTENCE_REGEX = /[^.!?]+[.!?]+|[^.!?]+$/g;

export interface ActionLabel {
  label: string;
  colorClass: string;
}

export interface ActionLabelFallbackInput {
  snapScore?: number | null;
  openViolations?: number | null;
  enforcementType?: string | null;
  violationTypes?: string[] | null;
  distressSignals?: string[] | null;
}

const RED_ACTION_LABEL = "text-destructive font-bold";

/** Detect the highest-priority action label in the text */
export function getActionLabel(text: string): ActionLabel | null {
  if (/CALL NOW/i.test(text)) {
    return { label: "CALL NOW", colorClass: RED_ACTION_LABEL };
  }
  if (/HIGH OPPORTUNITY/i.test(text)) {
    return { label: "HIGH OPPORTUNITY", colorClass: RED_ACTION_LABEL };
  }
  if (/GOOD OPPORTUNITY/i.test(text)) {
    return { label: "GOOD OPPORTUNITY", colorClass: RED_ACTION_LABEL };
  }
  if (/WORTH A CALL/i.test(text)) {
    return { label: "WORTH A CALL", colorClass: RED_ACTION_LABEL };
  }
  if (/\bMONITOR\b/i.test(text)) {
    return { label: "MONITOR", colorClass: RED_ACTION_LABEL };
  }
  if (/WATCH\/PASS/i.test(text)) {
    return { label: "WATCH", colorClass: RED_ACTION_LABEL };
  }
  if (/\bPASS\b/i.test(text)) {
    return { label: "PASS", colorClass: RED_ACTION_LABEL };
  }
  if (/\bWATCH\b/i.test(text)) {
    return { label: "WATCH", colorClass: RED_ACTION_LABEL };
  }
  return null;
}

export function getFallbackActionLabel({
  snapScore,
  openViolations,
  enforcementType,
  violationTypes,
  distressSignals,
}: ActionLabelFallbackInput): ActionLabel {
  const violations = openViolations ?? 0;
  const hasWaterShutoff = enforcementType === "water_shutoff" || distressSignals?.includes("water_shutoff_enforcement");
  const hasFireCitation =
    violationTypes?.some((type) => /fire/i.test(type)) ||
    distressSignals?.includes("fire_citation");

  if (hasWaterShutoff || hasFireCitation || ((snapScore ?? 0) >= 90 && violations >= 4)) {
    return { label: "CALL NOW", colorClass: RED_ACTION_LABEL };
  }

  if (((snapScore ?? 0) >= 70 && (snapScore ?? 0) < 90) || (violations >= 2 && violations <= 3)) {
    return { label: "WORTH A CALL", colorClass: RED_ACTION_LABEL };
  }

  return { label: "WATCH", colorClass: RED_ACTION_LABEL };
}

/** Remove action labels from the body text. */
export function stripActionLabel(text: string): string {
  return text
    .replace(ACTION_LABEL_LINE_REGEX, "")
    .replace(ACTION_LABELS_REGEX, "")
    .replace(/\*\*/g, "")
    .replace(/\s*[—–-]\s*$/g, "")
    .replace(/\.\s*\.\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Returns either the full brief or a preview trimmed at a natural sentence boundary.
 */
export function getBriefPreview(text: string, maxSentences = 2, maxChars = 140): string {
  const cleaned = stripActionLabel(text).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length <= maxChars) {
    return cleaned;
  }

  const sentences = cleaned.match(SENTENCE_REGEX)?.map((sentence) => sentence.trim()) ?? [cleaned];
  const selected: string[] = [];
  let totalLength = 0;

  for (const sentence of sentences) {
    if (selected.length >= maxSentences) break;

    const nextLength = totalLength + (selected.length > 0 ? 1 : 0) + sentence.length;

    if (selected.length > 0 && nextLength > maxChars) break;

    selected.push(sentence);
    totalLength = nextLength;

    if (totalLength >= maxChars) break;
  }

  return (selected.length > 0 ? selected.join(" ") : sentences[0] ?? cleaned).trim();
}
