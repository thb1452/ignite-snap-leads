// Temporary containment. Only a separately reviewed code change may remove it.
// No environment value, user role, source flag or request body can release it.
export function uploadExecutionHeld(): boolean { return true; }
export function uploadExecutionHeldResponse(cors: Record<string, string>, path: 'upload' | 'monitor' | 'geocoding'): Response {
  return new Response(JSON.stringify({
    error: `${path}_execution_held`,
    message: 'Processing is paused pending source and account verification. Existing files and processing evidence are unchanged.',
    success: false, accepted: false, started: false, providerCalls: 0, evidenceReset: false,
  }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
