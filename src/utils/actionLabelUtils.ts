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

export function getActionLabel(text: string): ActionLabel | null {
  if (/CALL NOW/i.test(text)) return { label: "CALL NOW", colorClass: RED_ACTION_LABEL };
  if (/HIGH OPPORTUNITY/i.test(text)) return { label: "HIGH OPPORTUNITY", colorClass: RED_ACTION_LABEL };
  if (/GOOD OPPORTUNITY/i.test(text)) return { label: "GOOD OPPORTUNITY", colorClass: RED_ACTION_LABEL };
  if (/WORTH A CALL/i.test(text)) return { label: "WORTH A CALL", colorClass: RED_ACTION_LABEL };
  if (/\bMONITOR\b/i.test(text)) return { label: "MONITOR", colorClass: RED_ACTION_LABEL };
  if (/WATCH\/PASS/i.test(text)) return { label: "WATCH", colorClass: RED_ACTION_LABEL };
  if (/\bPASS\b/i.test(text)) return { label: "PASS", colorClass: RED_ACTION_LABEL };
  if (/\bWATCH\b/i.test(text)) return { label: "WATCH", colorClass: RED_ACTION_LABEL };
  return null;
}

export function getFallbackActionLabel({
  snapScore,
  openViolations,
  enforcementType,
  violationTypes,
  distressSignals,
}: ActionLabelFallbackInput): ActionLabel {
  const score = snapScore ?? 0;
  const openCount = openViolations ?? 0;
  const hasWaterShutoff =
    enforcementType === "water_shutoff" ||
    distressSignals?.includes("water_shutoff_enforcement") ||
    distressSignals?.includes("maximum_enforcement_pressure");
  const hasFireCitation =
    Boolean(violationTypes?.some((type) => /fire/i.test(type))) ||
    distressSignals?.includes("fire_citation");

  if (hasWaterShutoff || hasFireCitation || (score >= 90 && openCount >= 4)) {
    return { label: "CALL NOW", colorClass: RED_ACTION_LABEL };
  }

  if ((score >= 70 && score < 90) || (openCount >= 2 && openCount <= 3)) {
    return { label: "WORTH A CALL", colorClass: RED_ACTION_LABEL };
  }

  return { label: "WATCH", colorClass: RED_ACTION_LABEL };
}

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

export function getBriefPreview(text: string, maxSentences = 2, maxChars = 140): string {
  const cleaned = stripActionLabel(text).replace(/\s+/g, " ").trim();

  if (!cleaned) return "";

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
