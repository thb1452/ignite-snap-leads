// drip-enroll
// Manually enroll a lead in a sequence. Validates org, resolves to_number from owner/property contact,
// and creates a drip_enrollment with current_step=0 and next_run_at=now (or first step delay).
//
// Body: { lead_id: uuid, sequence_id: uuid, to_number?: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const authHeader = req.headers.get("authorization") ?? "";
  const { data: authData, error: authErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = authData.user.id;

  const { data: profile } = await admin.from("profiles").select("org_id").eq("user_id", userId).maybeSingle();
  if (!profile?.org_id) return json({ error: "No org" }, 400);
  const orgId = profile.org_id as string;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { lead_id, sequence_id, to_number } = body ?? {};
  if (!lead_id || !sequence_id) return json({ error: "lead_id and sequence_id required" }, 400);

  // Validate lead and sequence belong to org
  const { data: lead } = await admin.from("leads").select("id, org_id, owner_id, property_id").eq("id", lead_id).maybeSingle();
  if (!lead || lead.org_id !== orgId) return json({ error: "Lead not found" }, 404);

  const { data: seq } = await admin.from("drip_sequences").select("id, org_id, is_active").eq("id", sequence_id).maybeSingle();
  if (!seq || seq.org_id !== orgId) return json({ error: "Sequence not found" }, 404);
  if (!seq.is_active) return json({ error: "Sequence inactive" }, 409);

  // Resolve to_number from owner if not provided
  let phone = to_number;
  if (!phone && lead.owner_id) {
    const { data: owner } = await admin.from("owners").select("phones").eq("id", lead.owner_id).maybeSingle();
    const phones = (owner?.phones as any[]) ?? [];
    phone = phones[0]?.number ?? phones[0] ?? null;
  }
  if (!phone) return json({ error: "No phone number for lead" }, 422);

  // Get first step delay
  const { data: firstStep } = await admin
    .from("drip_steps").select("delay_hours")
    .eq("sequence_id", sequence_id).eq("step_order", 0).maybeSingle();
  const nextRun = new Date(Date.now() + ((firstStep?.delay_hours ?? 0) * 3600 * 1000)).toISOString();

  const { data: enrollment, error: enErr } = await admin
    .from("drip_enrollments")
    .insert({
      org_id: orgId, lead_id, sequence_id, current_step: 0,
      next_run_at: nextRun, status: "active", to_number: phone,
      enrolled_by: userId,
    })
    .select("id, next_run_at").single();

  if (enErr) {
    if (enErr.code === "23505") return json({ error: "Lead already enrolled in this sequence" }, 409);
    return json({ error: enErr.message }, 500);
  }

  await admin.from("lead_activities").insert({
    lead_id, org_id: orgId, actor_id: userId,
    activity_type: "drip_enrolled",
    payload: { sequence_id, enrollment_id: enrollment.id, next_run_at: enrollment.next_run_at },
  });

  return json({ ok: true, enrollment_id: enrollment.id, next_run_at: enrollment.next_run_at });
});
