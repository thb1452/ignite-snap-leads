/**
 * Fire-and-forget system logger.
 * Logs general system events to the system_logs table.
 * Never throws — failures are silently swallowed.
 */
import { supabase } from "@/integrations/supabase/client";

type LogType = "info" | "warning" | "error" | "debug";

interface SystemLogParams {
  type?: LogType;
  source?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function logSystem({ type = "info", source = "frontend", message, metadata }: SystemLogParams): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await (supabase as any).from("system_logs").insert({
      type,
      source,
      message: message.slice(0, 2000),
      metadata: metadata ?? null,
      user_id: session?.user?.id ?? null,
    });
  } catch {
    // Silent fail
  }
}
