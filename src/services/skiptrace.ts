import { callFn } from "@/integrations/http/functions";
import type { PropertyContact } from "./contacts";

type SkipTraceResponse = { ok: true; contacts: PropertyContact[] };

export async function runSkipTrace(
  propertyId: string,
  opts?: { phoneHint?: string }
): Promise<PropertyContact[]> {
  const res = await callFn<SkipTraceResponse>("skiptrace", {
    property_id: propertyId,
    phone_hint: opts?.phoneHint ?? null,
  });
  if (!res?.ok) throw new Error("Skip trace failed");
  return res.contacts ?? [];
}
