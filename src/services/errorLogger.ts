/**
 * Fire-and-forget error logger.
 * Sends client-side errors to the error_logs table.
 * Never throws — logging failures are silently swallowed
 * so they can't cause recursive crashes.
 */
import { supabase } from "@/integrations/supabase/client";

interface ErrorLogPayload {
  error_message: string;
  error_stack?: string;
  component_stack?: string;
  url?: string;
  user_agent?: string;
  severity?: "error" | "warning" | "fatal";
  metadata?: Record<string, unknown>;
}

export async function logErrorToDb(payload: ErrorLogPayload): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    // Use .from() with explicit typing since the table is new
    await (supabase as any).from("error_logs").insert({
      user_id: userId,
      error_message: payload.error_message.slice(0, 2000),
      error_stack: payload.error_stack?.slice(0, 8000) ?? null,
      component_stack: payload.component_stack?.slice(0, 4000) ?? null,
      url: payload.url ?? (typeof window !== "undefined" ? window.location.href : null),
      user_agent: payload.user_agent ?? (typeof navigator !== "undefined" ? navigator.userAgent : null),
      severity: payload.severity ?? "error",
      metadata: payload.metadata ?? null,
    });
  } catch {
    // Silently swallow — never let logging break the app
  }
}

/**
 * Install global listeners for unhandled errors and promise rejections.
 * Call once at app startup.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    logErrorToDb({
      error_message: event.message || "Unhandled error",
      error_stack: event.error?.stack,
      severity: "error",
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    logErrorToDb({
      error_message:
        reason instanceof Error
          ? reason.message
          : String(reason ?? "Unhandled promise rejection"),
      error_stack: reason instanceof Error ? reason.stack : undefined,
      severity: "error",
      metadata: { type: "unhandledrejection" },
    });
  });
}
