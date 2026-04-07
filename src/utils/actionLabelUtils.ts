/**
 * Shared action label parsing for AI investor briefs.
 * Extracts the label, strips it from body text, and always renders it last.
 *
 * v9.4 format places the label on its own line after a blank line:
 *   "Brief text here.\n\nCALL NOW"
 */

const ACTION_LABEL_LINE_REGEX =
  /\n?\s*\n?\s*\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\s*\*?\*?\s*$/i;

const ACTION_LABELS_REGEX =
  /\*?\*?⚡?\s*(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\*?\*?/gi;

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
  if (/\bMONITOR\b/i.test(text))
    return { label: "MONITOR", colorClass: "text-orange-400 font-bold" };
  if (/WATCH\/PASS/i.test(text))
    return { label: "WATCH", colorClass: "text-green-400 font-bold" };
  if (/\bPASS\b/i.test(text))
    return { label: "PASS", colorClass: "text-green-400 font-bold" };
  if (/\bWATCH\b/i.test(text))
    return { label: "WATCH", colorClass: "text-green-400 font-bold" };
  return null;
}

/**
 * Remove ALL occurrences of action labels from text body.
 * Handles v9.4 format where the label is on its own line.
 */
export function stripActionLabel(text: string): string {
  // First try to strip the trailing label line (v9.4 format)
  let result = text.replace(ACTION_LABEL_LINE_REGEX, "");
  // Then strip any remaining inline occurrences
  result = result
    .replace(ACTION_LABELS_REGEX, "")
    .replace(/\*\*/g, "")
    .replace(/\s*[—–-]\s*$/g, "")
    .replace(/\.\s*\.\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return result;
}
