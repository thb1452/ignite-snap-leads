/** Explicit allowlist: newly introduced app routes default to noindex. */
const PUBLIC_PATHS = new Set([
  "/", "/pricing", "/about", "/privacy", "/privacy-policy", "/terms", "/terms-and-conditions", "/blog",
  "/code-violation-leads", "/distressed-property-data", "/code-enforcement-data", "/municipal-enforcement-data",
  "/real-estate-distress-signals", "/off-market-property-leads", "/how-investors-find-distressed-properties",
  "/code-violations", "/live-feed",
]);

export function isPublicIndexablePath(pathname: string): boolean {
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return PUBLIC_PATHS.has(path);
}
