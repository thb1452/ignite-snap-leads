import { supabase } from "@/integrations/supabase/client";

/**
 * BatchData API raw response structure
 */
export type BatchDataRawResponse = {
  owner_name?: string | null;
  phones?: (string | { number: string })[] | null;
  emails?: string[] | null;
  [key: string]: unknown;
};

export type PropertyContact = {
  id: string;
  property_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  raw_payload: BatchDataRawResponse | null;
  created_at: string;
};

type SkipTraceResponse = {
  ok: true;
  contacts: PropertyContact[];
  raw_data: BatchDataRawResponse;
};

async function getUserToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  console.log("[skiptrace] Token check:", token ? "Token found" : "No token");
  if (!token) throw new Error("Please sign in again");
  return token;
}

export async function runSkipTrace(
  propertyId: string,
  opts?: { phoneHint?: string }
): Promise<SkipTraceResponse> {
  console.log("[skiptrace] Starting skip trace for property:", propertyId);
  
  const token = await getUserToken();
  
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/skiptrace`;
  console.log("[skiptrace] Calling edge function:", url);
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      property_id: propertyId,
      phone_hint: opts?.phoneHint ?? null,
    }),
  });

  console.log("[skiptrace] Response status:", res.status);
  
  const json = await res.json();
  console.log("[skiptrace] Response data:", json);
  
  if (!res.ok || !json.ok) {
    const errorMsg = json.error || `Skip trace failed (${res.status})`;
    console.error("[skiptrace] Error:", errorMsg);
    if (res.status === 429) {
      throw new Error("Provider rate-limited. Please retry in a minute.");
    }
    throw new Error(errorMsg);
  }
  
  console.log("[skiptrace] Success! Found contacts:", json.contacts?.length ?? 0);
  return json as SkipTraceResponse;
}
