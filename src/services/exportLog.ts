import { supabase } from "@/integrations/supabase/externalClient";

interface ExportLogParams {
  rowCount: number;
  stateFilter?: string | null;
  cityFilter?: string | null;
  filters?: Record<string, unknown>;
}

/**
 * Log an export event to the export_logs table.
 * Fire-and-forget — errors are logged but don't block the export flow.
 */
export async function logExportEvent(params: ExportLogParams): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user?.id;
    if (!userId) return;

    await supabase.from("export_logs" as any).insert({
      user_id: userId,
      row_count: params.rowCount,
      state_filter: params.stateFilter || null,
      city_filter: params.cityFilter || null,
      filters: params.filters || {},
    });
  } catch (err) {
    console.error("[exportLog] Failed to log export event:", err);
  }
}
