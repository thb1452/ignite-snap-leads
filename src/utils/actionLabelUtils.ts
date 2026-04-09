const ACTION_LABEL_LINE_REGEX =
  /\n?\s*\n?\s*\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|OPPORTUNITY|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\s*\*?\*?\s*$/i;

const ACTION_LABELS_REGEX =
  /\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|OPPORTUNITY|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\*?\*?/gi;

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

const ACTION_LABEL_PRIORITY = {
  PASS: 0,
  OPPORTUNITY: 1,
  "WORTH A CALL": 2,
  "CALL NOW": 3,
} as const;

type ActionLabelKey = keyof typeof ACTION_LABEL_PRIORITY;

function createActionLabel(label: ActionLabelKey): ActionLabel {
  switch (label) {
    case "CALL NOW":
      return { label, colorClass: "text-destructive font-bold" };
    case "WORTH A CALL":
      return { label, colorClass: "text-orange-600 font-bold" };
    case "OPPORTUNITY":
      return { label, colorClass: "text-amber-500 font-bold" };
    case "PASS":
      return { label, colorClass: "bg-slate-200 text-slate-600 font-bold rounded-full px-2 py-0.5" };
  }
}

export function getActionLabel(text: string): ActionLabel | null {
  if (/\bCALL NOW\b/i.test(text) || /\bHIGH OPPORTUNITY\b/i.test(text)) {
    return createActionLabel("CALL NOW");
  }
  if (/\bWORTH A CALL\b/i.test(text) || /\bGOOD OPPORTUNITY\b/i.test(text)) {
    return createActionLabel("WORTH A CALL");
  }
  if (/\bOPPORTUNITY\b/i.test(text)) {
    return createActionLabel("OPPORTUNITY");
  }
  if (/\bMONITOR\b/i.test(text) || /WATCH\/PASS/i.test(text) || /\bLOW PRIORITY\b/i.test(text) || /\bWATCH\b/i.test(text)) {
    return createActionLabel("OPPORTUNITY");
  }
  if (/\bPASS\b/i.test(text)) {
    return createActionLabel("PASS");
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

  if (openCount === 0) {
    return createActionLabel("PASS");
  }

  if (hasWaterShutoff || hasFireCitation || score >= 90) {
    return createActionLabel("CALL NOW");
  }

  if (score >= 70 || openCount >= 2) {
    return createActionLabel("WORTH A CALL");
  }

  if (score >= 40) {
    return createActionLabel("WORTH A CALL");
  }

  return createActionLabel("OPPORTUNITY");
}

export function getDisplayActionLabel(text: string, fallbackInput: ActionLabelFallbackInput): ActionLabel {
  const detected = getActionLabel(text);
  const fallback = getFallbackActionLabel(fallbackInput);

  if (!detected) return fallback;

  const detectedPriority = ACTION_LABEL_PRIORITY[detected.label as ActionLabelKey] ?? 0;
  const fallbackPriority = ACTION_LABEL_PRIORITY[fallback.label as ActionLabelKey] ?? 0;

  return detectedPriority >= fallbackPriority ? detected : fallback;
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

  const detectedLabel = getActionLabel(text)?.label ?? null;
  const labelSuffix = detectedLabel ? ` ${detectedLabel}` : "";
  const reservedForLabel = labelSuffix.length + 1;
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

  if (detectedLabel) {
    body = body.replace(ACTION_LABELS_REGEX, "").replace(/\s{2,}/g, " ").trim();
    body = body.replace(/[\s,;:—–\-]+$/g, "");
  }

  if (truncated) {
    body = `${body.replace(/[.!?]+$/g, "").trim()}…`;
  }

  return `${body}${labelSuffix}`.trim();
}
