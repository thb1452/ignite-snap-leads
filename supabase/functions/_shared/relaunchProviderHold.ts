// These are code-level release gates. Neither an environment flag nor a request
// option can release them. Authentication does not grant permission to spend or
// send. Reopening requires a separately reviewed reservation/delivery design.
export function relaunchProviderHeld(): boolean { return true; }

export function relaunchProviderHeldResponse(
  kind: "enrichment" | "communications" | "digest",
  cors: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({
    error: `${kind}_held`,
    message: kind === "enrichment"
      ? "Contact enrichment is paused pending property authorization and spending verification."
      : "Outbound delivery is paused pending recipient authorization and delivery verification.",
  }), {
    status: 503,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
