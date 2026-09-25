/** First-party diagnostic codes only. Logging never blocks the app or throws. */
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorDiagnostic, type ErrorDiagnosticInput } from "@/lib/errorTelemetryPolicy";

export async function logErrorToDb(payload: ErrorDiagnosticInput): Promise<void> {
  try {
    const safe = sanitizeErrorDiagnostic(payload, typeof window !== "undefined" ? window.location.pathname : null);
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("error_logs").insert({
      user_id: session?.user?.id ?? null,
      ...safe,
    });
  } catch {
    // Logging failures must not create another error report.
  }
}

let installed = false;
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener("error", (event) => {
    void logErrorToDb({ event: "unhandled_error", errorName: event.error?.name, severity: "error" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    void logErrorToDb({
      event: "unhandled_rejection",
      errorName: event.reason instanceof Error ? event.reason.name : undefined,
      severity: "error",
    });
  });
}
