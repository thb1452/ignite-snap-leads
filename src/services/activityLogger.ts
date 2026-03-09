/**
 * Fire-and-forget user activity logger.
 * Inserts into user_activity_log — failures are silently ignored
 * so tracking never blocks or breaks the UI.
 */
import { supabase } from "@/integrations/supabase/client";

type ActivityAction =
  | "page_view"
  | "login"
  | "signup"
  | "property_viewed"
  | "property_saved"
  | "property_unsaved"
  | "list_created"
  | "list_deleted"
  | "export_csv"
  | "filter_used"
  | "upload_started"
  | "upload_completed"
  | "search";

interface LogParams {
  action: ActivityAction;
  metadata?: Record<string, unknown>;
  pagePath?: string;
}

export async function logActivity({ action, metadata = {}, pagePath }: LogParams) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return; // only track authenticated users

    // Fire-and-forget — don't await in calling code
    await (supabase as any)
      .from("user_activity_log")
      .insert({
        user_id: session.user.id,
        action,
        metadata,
        page_path: pagePath ?? (typeof window !== "undefined" ? window.location.pathname : null),
      });
  } catch {
    // Silent fail — never break the app for tracking
  }
}
