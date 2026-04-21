// Idempotency: prefer client-supplied Idempotency-Key header, else derive
// from (integration_id + action_type + stable payload hash).
// Dedupe window: 24h for header-based, 60s for derived.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

export interface IdempotencyContext {
  integrationId: string;
  actionType: string;
  derivedFrom: Record<string, unknown>; // stable payload subset
  headerKey: string | null;
}

export async function resolveIdempotencyKey(ctx: IdempotencyContext): Promise<{
  key: string;
  source: "header" | "derived";
  windowMs: number;
}> {
  if (ctx.headerKey && ctx.headerKey.length >= 8 && ctx.headerKey.length <= 256) {
    return { key: `hdr:${ctx.headerKey}`, source: "header", windowMs: 24 * 60 * 60 * 1000 };
  }
  const stable = stableStringify(ctx.derivedFrom);
  const hash = await sha256Hex(`${ctx.integrationId}|${ctx.actionType}|${stable}`);
  return { key: `der:${hash}`, source: "derived", windowMs: 60 * 1000 };
}

/**
 * Recursive stable JSON stringify — sorts keys at every depth so
 * { a:1, b:{x:1,y:2} } and { b:{y:2,x:1}, a:1 } produce identical hashes.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export async function findRecentDuplicate(
  admin: SupabaseClient,
  integrationId: string,
  actionType: string,
  idempotencyKey: string,
  windowMs: number
): Promise<
  | { id: number; created_at: string; success: boolean; response_status: number | null; request_metadata: Record<string, unknown> | null }
  | null
> {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { data } = await admin
    .from("integration_action_log")
    .select("id, created_at, success, response_status, request_metadata")
    .eq("integration_id", integrationId)
    .eq("action_type", actionType)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!data) return null;
  for (const row of data) {
    const meta = (row as any).request_metadata as Record<string, unknown> | null;
    if (meta && meta.idempotency_key === idempotencyKey) {
      return {
        id: row.id as number,
        created_at: row.created_at as string,
        success: row.success as boolean,
        response_status: (row.response_status as number | null) ?? null,
        request_metadata: meta,
      };
    }
  }
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
