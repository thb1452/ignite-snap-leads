type JsonName = {
  first?: unknown;
  last?: unknown;
  middle?: unknown;
  name?: unknown;
};

function titleCaseWord(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function titleCaseName(s: string): string {
  return s
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => titleCaseWord(w))
    .join(" ");
}

/**
 * Some contact rows have `name` stored as a JSON string like:
 *   {"first":"john","last":"doe"}
 * This normalizes that into a display-friendly name.
 */
export function formatOwnerName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";

  // Fast path: normal string name
  if (!(s.startsWith("{") && s.endsWith("}"))) return s;

  try {
    const parsed = JSON.parse(s) as JsonName;

    const first = typeof parsed.first === "string" ? parsed.first : "";
    const middle = typeof parsed.middle === "string" ? parsed.middle : "";
    const last = typeof parsed.last === "string" ? parsed.last : "";
    const name = typeof parsed.name === "string" ? parsed.name : "";

    const combined =
      [first, middle, last].map((x) => x.trim()).filter(Boolean).join(" ").trim() ||
      name.trim();

    if (!combined) return raw ?? "";
    return titleCaseName(combined);
  } catch {
    return raw ?? "";
  }
}

