// Minimal wrapper to call Supabase Edge Functions with the user's JWT.
import { supabase } from "@/integrations/supabase/client";

export async function callFn<T = any>(
  name: "skiptrace" | "sms-send" | "email-send" | "export-csv",
  payload?: unknown,
  init?: RequestInit
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: init?.method ?? (payload ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers ?? {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  // CSV export returns text/csv
  const isCSV = res.headers.get("content-type")?.includes("text/csv");
  if (!res.ok) {
    const err = isCSV ? await res.text() : await res.json().catch(() => ({}));
    throw new Error(typeof err === "string" ? err : err?.error || `Function ${name} failed`);
  }
  return (isCSV ? (await res.text() as any) : await res.json()) as T;
}

export function assert(ok: any, msg = "Unexpected empty result"): asserts ok {
  if (!ok) throw new Error(msg);
}
