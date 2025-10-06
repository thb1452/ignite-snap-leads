import { supabase } from "@/integrations/supabase/client";

export type PropertyContact = {
  id: string;
  property_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  raw_payload: any;
  created_at: string;
};

type SkipTraceResponse = { 
  ok: true; 
  contacts: PropertyContact[];
  raw_data: any;
};

async function getUserToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again");
  return token;
}

export async function runSkipTrace(
  propertyId: string,
  opts?: { phoneHint?: string }
): Promise<SkipTraceResponse> {
  const token = await getUserToken();
  
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/skiptrace`, {
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

  const json = await res.json();
  
  if (!res.ok || !json.ok) {
    const errorMsg = json.error || `Skip trace failed (${res.status})`;
    if (res.status === 429) {
      throw new Error("Provider rate-limited. Please retry in a minute.");
    }
    throw new Error(errorMsg);
  }
  
  return json as SkipTraceResponse;
}
