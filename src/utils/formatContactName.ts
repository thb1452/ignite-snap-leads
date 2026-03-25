function toTitleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractNameFromObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const first = typeof record.first === "string" ? record.first : "";
  const last = typeof record.last === "string" ? record.last : "";
  const full = typeof record.full === "string" ? record.full : "";
  const name = [first, last].filter(Boolean).join(" ").trim() || full.trim();

  return name ? toTitleCase(name) : null;
}

export function formatContactName(rawName: string | null | undefined): string {
  if (!rawName) return "Unknown";

  const trimmed = rawName.trim();
  if (!trimmed) return "Unknown";

  // Some providers save owner names as serialized JSON, e.g. {"first":"john","last":"doe"}.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const parsedName = extractNameFromObject(parsed);
      if (parsedName) return parsedName;
    } catch {
      // Fall through to plain text handling.
    }
  }

  return toTitleCase(trimmed);
}
