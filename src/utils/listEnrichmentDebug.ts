/**
 * Verbose logging for List Enrichment “additional leads” (Y) flow.
 * - Always on in Vite dev (`import.meta.env.DEV`).
 * - Or add `?debugEnrichY=1` once (stored in sessionStorage as SNAP_DEBUG_ENRICH_Y).
 */
export function shouldLogListEnrichmentY(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("debugEnrichY");
    if (q === "1" || q === "true") {
      sessionStorage.setItem("SNAP_DEBUG_ENRICH_Y", "1");
      return true;
    }
    return sessionStorage.getItem("SNAP_DEBUG_ENRICH_Y") === "1";
  } catch {
    return false;
  }
}
