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

  // Preserve the action label so it always appears at the end of the preview,
  // even when the middle of the brief is truncated.
  const detectedLabel = getActionLabel(text)?.label ?? null;
  const labelSuffix = detectedLabel ? ` ${detectedLabel}` : "";
  const reservedForLabel = labelSuffix.length + 1; // +1 for the ellipsis
  const bodyMaxChars = Math.max(20, maxChars - reservedForLabel);

  const sentences = cleaned.match(SENTENCE_REGEX)?.map((sentence) => sentence.trim()) ?? [cleaned];
  const selected: string[] = [];
  let totalLength = 0;
  let truncated = false;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    if (selected.length >= maxSentences) {
      truncated = true;
      break;
    }

    const nextLength = totalLength + (selected.length > 0 ? 1 : 0) + sentence.length;
    if (selected.length > 0 && nextLength > bodyMaxChars) {
      truncated = true;
      break;
    }

    selected.push(sentence);
    totalLength = nextLength;

    if (totalLength >= bodyMaxChars) {
      if (i < sentences.length - 1) truncated = true;
      break;
    }
  }

  if (selected.length < sentences.length && selected.length < maxSentences) {
    truncated = true;
  }

  let body = (selected.length > 0 ? selected.join(" ") : sentences[0] ?? cleaned).trim();

  // If body still contains the action label (e.g., already in the original
  // text), strip it so we don't show it twice.
  if (detectedLabel) {
    body = body.replace(ACTION_LABELS_REGEX, "").replace(/\s{2,}/g, " ").trim();
    // Drop trailing punctuation/connector chars before appending the label.
    body = body.replace(/[\s,;:—–\-]+$/g, "");
  }

  if (truncated) {
    body = `${body.replace(/[.!?]+$/g, "").trim()}…`;
  }

  return `${body}${labelSuffix}`.trim();
}
