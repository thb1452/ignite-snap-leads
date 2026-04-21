// Strip credential-like values from any object before logging.
// Never log: api_key, auth_token, password, secret, token, authorization, bearer
const SECRET_KEY_RE = /^(api[_-]?key|auth[_-]?token|password|secret|token|authorization|account[_-]?sid)$/i;

export function sanitizeForLog(input: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (input == null) return input;
  if (typeof input === "string") {
    // Mask anything that looks like a long opaque token
    if (input.length >= 20 && /^[A-Za-z0-9._\-+/=]+$/.test(input)) {
      return `${input.slice(0, 4)}…${input.slice(-4)}`;
    }
    return input;
  }
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((v) => sanitizeForLog(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = typeof v === "string" && v.length > 0 ? `${v.slice(0, 4)}…${v.slice(-2)}` : "[redacted]";
    } else {
      out[k] = sanitizeForLog(v, depth + 1);
    }
  }
  return out;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***-***-${digits.slice(-4)}`;
}
