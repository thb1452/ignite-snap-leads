/**
 * Shared action label parsing for AI investor briefs.
 * Extracts the label, strips it from body text, and always renders it last.
 */

const ACTION_LABELS_REGEX =
  /\*?\*?(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\*?\*?/gi;

export interface ActionLabel {
  label: string;
  colorClass: string;
}

/** Detect the highest-priority action label in the text */
export function getActionLabel(text: string): ActionLabel | null {
  if (/CALL NOW/i.test(text))
    return { label: "CALL NOW", colorClass: "text-red-500 font-bold" };
  if (/HIGH OPPORTUNITY/i.test(text))
    return { label: "HIGH OPPORTUNITY", colorClass: "text-red-500 font-bold" };
  if (/GOOD OPPORTUNITY/i.test(text))
    return { label: "GOOD OPPORTUNITY", colorClass: "text-orange-400 font-bold" };
  if (/WORTH A CALL/i.test(text))
    return { label: "WORTH A CALL", colorClass: "text-orange-400 font-bold" };
  if (/MONITOR/i.test(text))
    return { label: "MONITOR", colorClass: "text-orange-400 font-bold" };
  if (/WATCH\/PASS/i.test(text))
    return { label: "WATCH", colorClass: "text-gray-400 font-bold" };
  if (/PASS/i.test(text))
    return { label: "PASS", colorClass: "text-gray-400 font-bold" };
  if (/WATCH/i.test(text))
    return { label: "WATCH", colorClass: "text-gray-400 font-bold" };
  return null;
}

/**
 * Remove ALL occurrences of action labels from text body.
 * This ensures the label never appears mid-sentence.
 */
export function stripActionLabel(text: string): string {
  return text
    .replace(ACTION_LABELS_REGEX, "")
    .replace(/\*\*/g, "")
    .replace(/\s*[—–-]\s*$/g, "")
    .replace(/\.\s*\.\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
