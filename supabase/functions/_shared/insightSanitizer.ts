const ACTION_LABEL_REGEX = /\b(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\b/gi;
const ACTION_LABEL_LINE_REGEX = /\n?\s*\n?\s*\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\s*\*?\*?\s*$/i;
const COMPLETE_SENTENCE_REGEX = /[^.!?]+[.!?]+/g;
const SENTENCE_END_REGEX = /[.!?]["')\]]*\s*$/;

function normalizeActionLabel(label: string | null | undefined): string | null {
  const normalized = (label ?? "").trim().toUpperCase();

  switch (normalized) {
    case "CALL NOW":
    case "HIGH OPPORTUNITY":
      return "CALL NOW";
    case "WORTH A CALL":
    case "GOOD OPPORTUNITY":
      return "WORTH A CALL";
    case "WATCH":
    case "MONITOR":
    case "LOW PRIORITY":
    case "WATCH/PASS":
    case "PASS":
      return "WATCH";
    default:
      return null;
  }
}

export function normalizeInsightText(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\*\*/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
}

export function extractActionLabel(text: string | null | undefined): string | null {
  const normalized = normalizeInsightText(text);
  if (!normalized) return null;

  const matches = [...normalized.matchAll(ACTION_LABEL_REGEX)];
  const lastMatch = matches.at(-1)?.[1] ?? null;

  return normalizeActionLabel(lastMatch);
}

function stripActionLabels(text: string): string {
  return text
    .replace(ACTION_LABEL_LINE_REGEX, "")
    .replace(ACTION_LABEL_REGEX, "")
    .replace(/\s*[—–-]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getCompleteInsightBody(text: string | null | undefined): string {
  const normalized = normalizeInsightText(text);
  const body = stripActionLabels(normalized);

  if (!body) return "";
  if (SENTENCE_END_REGEX.test(body)) return body;

  const completeSentences = body.match(COMPLETE_SENTENCE_REGEX)?.map((sentence) => sentence.trim()) ?? [];
  return completeSentences.join(" ").trim();
}

export function sanitizeInsightForStorage(
  text: string | null | undefined,
  fallbackLabel?: string | null,
): string | null {
  const normalized = normalizeInsightText(text);
  if (!normalized) return null;

  const actionLabel = extractActionLabel(normalized) ?? normalizeActionLabel(fallbackLabel);
  const body = getCompleteInsightBody(normalized);

  if (!body) return null;

  return actionLabel ? `${body}\n\n${actionLabel}` : body;
}

export function hasReadableInsightBody(text: string | null | undefined): boolean {
  return getCompleteInsightBody(text).length > 0;
}