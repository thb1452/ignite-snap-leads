// Single helper to insert action-log rows + (optionally) bump daily spend.
// All BYOA edge functions must call this to satisfy audit/cost-tracking requirements.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { sanitizeForLog } from "./sanitize.ts";

export interface LogActionInput {
  integrationId: string;
  userId: string;
  actionType: string; // 'sms.send' | 'skiptrace.lookup' | 'integration.validate' | 'integration.revalidate'
  success: boolean;
  responseStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  costEstimateUsd?: number | null;
  requestMetadata?: Record<string, unknown> | null;
}

export async function logAction(admin: SupabaseClient, input: LogActionInput) {
  const sanitizedMeta = input.requestMetadata
    ? (sanitizeForLog(input.requestMetadata) as Record<string, unknown>)
    : null;

  const { error: logErr } = await admin.from("integration_action_log" as any).insert({
    integration_id: input.integrationId,
    user_id: input.userId,
    action_type: input.actionType,
    success: input.success,
    response_status: input.responseStatus ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    cost_estimate_usd: input.costEstimateUsd ?? null,
    request_metadata: sanitizedMeta,
  } as any);
  if (logErr) console.error("[byoa/logAction] insert failed:", logErr.message);

  // Bump daily spend if cost was incurred
  if (input.success && input.costEstimateUsd && input.costEstimateUsd > 0) {
    const { error: rpcErr } = await admin.rpc("byoa_bump_daily_spend" as any, {
      p_integration_id: input.integrationId,
      p_amount_usd: input.costEstimateUsd,
    } as any);
    // RPC may not exist yet — fall back to inline update
    if (rpcErr) {
      const { data: row } = await admin
        .from("user_integrations" as any)
        .select("daily_spend_used_usd, daily_spend_reset_at")
        .eq("id", input.integrationId)
        .maybeSingle();
      if (row) {
        const reset = (row as any).daily_spend_reset_at as string | null;
        const stale = !reset || Date.now() - new Date(reset).getTime() > 24 * 60 * 60 * 1000;
        const next = stale
          ? input.costEstimateUsd
          : Number((row as any).daily_spend_used_usd ?? 0) + input.costEstimateUsd;
        await admin
          .from("user_integrations" as any)
          .update({
            daily_spend_used_usd: next,
            daily_spend_reset_at: stale ? new Date().toISOString() : reset,
          } as any)
          .eq("id", input.integrationId);
      }
    }
  }
}

export async function checkSpendCap(
  admin: SupabaseClient,
  integrationId: string
): Promise<{ ok: true } | { ok: false; capUsd: number; usedUsd: number }> {
  const { data } = await admin
    .from("user_integrations" as any)
    .select("daily_spend_cap_usd, daily_spend_used_usd, daily_spend_reset_at")
    .eq("id", integrationId)
    .maybeSingle();
  if (!data) return { ok: true };
  const cap = (data as any).daily_spend_cap_usd as number | null;
  if (cap == null) return { ok: true };
  const reset = (data as any).daily_spend_reset_at as string | null;
  const stale = !reset || Date.now() - new Date(reset).getTime() > 24 * 60 * 60 * 1000;
  const used = stale ? 0 : Number((data as any).daily_spend_used_usd ?? 0);
  if (used >= cap) return { ok: false, capUsd: cap, usedUsd: used };
  return { ok: true };
}
