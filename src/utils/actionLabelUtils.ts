const ACTION_LABEL_LINE_REGEX =
  /\n?\s*\n?\s*\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\s*\*?\*?\s*$/i;

const ACTION_LABELS_REGEX =
  /\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\*?\*?/gi;

const SENTENCE_REGEX = /[^.!?]+[.!?]+|[^.!?]+$/g;
const COMPLETE_SENTENCE_REGEX = /[^.!?]+[.!?]+/g;
const SENTENCE_END_REGEX = /[.!?]["')\]]*\s*$/;

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
const ACTION_LABEL_PRIORITY = {
  WATCH: 0,
  "WORTH A CALL": 1,
  "CALL NOW": 2,
} as const;

function createActionLabel(label: "CALL NOW" | "WORTH A CALL" | "WATCH"): ActionLabel {
  return { label, colorClass: RED_ACTION_LABEL };
}

export function getActionLabel(text: string): ActionLabel | null {
  if (/\bCALL NOW\b/i.test(text) || /\bHIGH OPPORTUNITY\b/i.test(text)) {
    return createActionLabel("CALL NOW");
  }
  if (/\bWORTH A CALL\b/i.test(text) || /\bGOOD OPPORTUNITY\b/i.test(text)) {
    return createActionLabel("WORTH A CALL");
  }
  if (/\bMONITOR\b/i.test(text) || /WATCH\/PASS/i.test(text) || /\bLOW PRIORITY\b/i.test(text) || /\bPASS\b/i.test(text) || /\bWATCH\b/i.test(text)) {
    return createActionLabel("WATCH");
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
  const score = snapScore ?? 0;
  const openCount = openViolations ?? 0;
  const hasWaterShutoff =
    enforcementType === "water_shutoff" ||
    distressSignals?.includes("water_shutoff_enforcement") ||
    distressSignals?.includes("maximum_enforcement_pressure");
  const hasFireCitation =
    Boolean(violationTypes?.some((type) => /fire/i.test(type))) ||
    distressSignals?.includes("fire_citation");

  if (hasWaterShutoff || hasFireCitation || score >= 90) {
    return createActionLabel("CALL NOW");
  }

  if (score >= 70 || openCount >= 2) {
    return createActionLabel("WORTH A CALL");
  }

  return createActionLabel("WATCH");
}

export function getDisplayActionLabel(text: string, fallbackInput: ActionLabelFallbackInput): ActionLabel {
  const detected = getActionLabel(text);
  const fallback = getFallbackActionLabel(fallbackInput);

  if (!detected) return fallback;

  return ACTION_LABEL_PRIORITY[detected.label] >= ACTION_LABEL_PRIORITY[fallback.label]
    ? detected
    : fallback;
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

export function getCompleteBriefText(text: string): string {
  const cleaned = stripActionLabel(text).replace(/\s+/g, " ").trim();

  if (!cleaned) return "";
  if (SENTENCE_END_REGEX.test(cleaned)) return cleaned;

  const completeSentences = cleaned.match(COMPLETE_SENTENCE_REGEX)?.map((sentence) => sentence.trim()) ?? [];

  if (completeSentences.length > 0) {
    return completeSentences.join(" ").trim();
  }

  return `${cleaned.replace(/[\s,;:—–-]+$/g, "").trim()}…`;
}

export function getBriefPreview(text: string, maxSentences = 2, maxChars = 140): string {
  const cleaned = getCompleteBriefText(text);

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
