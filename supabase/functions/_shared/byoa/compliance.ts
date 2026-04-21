// SMS compliance gate. Hardcoded TCPA defaults for Phase 2.
// Per-org overrides will plug in via user_integrations.compliance_overrides (Phase 3).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { resolveRecipientTimezone, localHourInTz } from "./timezone.ts";

// TCPA quiet hours: do not send before 8am or after 9pm recipient-local.
export const QUIET_HOURS = { startHour: 8, endHourExclusive: 21 } as const;

// States with stricter SMS requirements where we block by default.
// WA: requires explicit prior express consent for marketing SMS (RCW 19.190).
// FL: Florida Telephone Solicitation Act — blocked by default for marketing.
// OK: similar mini-TCPA framework.
export const BLOCKED_STATES = new Set(["WA", "FL", "OK"]);

export type ComplianceFailure =
  | { ok: false; reason: "quiet_hours"; localHour: number; tz: string }
  | { ok: false; reason: "blocked_state"; state: string }
  | { ok: false; reason: "suppression_list"; phone: string }
  | { ok: false; reason: "invalid_phone" };

export type ComplianceResult = { ok: true } | ComplianceFailure;

export interface ComplianceInput {
  toPhoneE164: string;
  recipientZip?: string | null;
  recipientState?: string | null;
  orgId: string;
}

export async function checkSmsCompliance(
  admin: SupabaseClient,
  input: ComplianceInput
): Promise<ComplianceResult> {
  // Phone shape check (E.164 US)
  if (!/^\+1\d{10}$/.test(input.toPhoneE164)) {
    return { ok: false, reason: "invalid_phone" };
  }

  // Blocked states
  if (input.recipientState && BLOCKED_STATES.has(input.recipientState.toUpperCase())) {
    return { ok: false, reason: "blocked_state", state: input.recipientState.toUpperCase() };
  }

  // Suppression list (org-scoped)
  const { data: suppressed } = await admin
    .from("suppression_list" as any)
    .select("phone")
    .eq("org_id", input.orgId)
    .eq("phone", input.toPhoneE164)
    .maybeSingle();
  if (suppressed) {
    return { ok: false, reason: "suppression_list", phone: input.toPhoneE164 };
  }

  // Quiet hours (recipient local time)
  const tz = resolveRecipientTimezone({ zip: input.recipientZip, phone: input.toPhoneE164 });
  const hour = localHourInTz(tz);
  if (hour < QUIET_HOURS.startHour || hour >= QUIET_HOURS.endHourExclusive) {
    return { ok: false, reason: "quiet_hours", localHour: hour, tz };
  }

  return { ok: true };
}
