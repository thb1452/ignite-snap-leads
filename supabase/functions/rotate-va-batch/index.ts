import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 2800;
const COOLDOWN_MONTHS = 5;

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Accept either internal secret or authenticated admin
    const internalSecret = req.headers.get("x-internal-secret");
    let isAuthorized = internalSecret === SERVICE_ROLE_KEY;

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (!isAuthorized) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: profile } = await supabaseAdmin
        .from("foia_profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!profile || profile.role !== "admin") return json({ error: "Forbidden" }, 403);
      isAuthorized = true;
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "check-all";

    if (action === "auto-assign-all") {
      return await handleAutoAssignAll(supabaseAdmin, json);
    }

    if (action === "check-batch-completion") {
      const vaId = body.va_id;
      if (!vaId) return json({ error: "va_id required" }, 400);
      return await handleCheckBatchCompletion(supabaseAdmin, vaId, json);
    }

    if (action === "check-all") {
      return await handleCheckAll(supabaseAdmin, json);
    }

    if (action === "manual-rotate") {
      const vaId = body.va_id;
      if (!vaId) return json({ error: "va_id required" }, 400);
      return await handleRotateVA(supabaseAdmin, vaId, "manual", json);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("rotate-va-batch error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

// ─── AUTO-ASSIGN ALL VAs ────────────────────────────────────────────────────────
async function handleAutoAssignAll(db: any, json: Function) {
  // 1. Get all active VAs
  const { data: vas } = await db
    .from("foia_profiles")
    .select("id, full_name")
    .eq("role", "va")
    .eq("is_active", true);
  if (!vas || vas.length === 0) return json({ error: "No active VAs found" }, 400);

  // 2. Get all active press accounts
  const { data: pressAccounts } = await db
    .from("press_accounts")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (!pressAccounts || pressAccounts.length === 0)
    return json({ error: "No active press accounts" }, 400);

  // 3. Assign 3 credentials per VA (round-robin, no overlap)
  const totalNeeded = vas.length * 3;
  if (pressAccounts.length < totalNeeded) {
    return json({
      error: `Need at least ${totalNeeded} active press accounts for ${vas.length} VAs (3 each). Only ${pressAccounts.length} available.`,
    }, 400);
  }

  // Clear existing credential slots
  await db.from("va_credential_slots").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Assign credentials: VA1 gets [0,1,2], VA2 gets [3,4,5], etc.
  const slotInserts: any[] = [];
  for (let vi = 0; vi < vas.length; vi++) {
    for (let slot = 0; slot < 3; slot++) {
      const credIdx = vi * 3 + slot;
      slotInserts.push({
        va_id: vas[vi].id,
        press_account_id: pressAccounts[credIdx].id,
        slot_number: slot + 1,
        is_active: slot === 0, // First slot is active
        batch_number: 0,
      });
    }
  }
  await db.from("va_credential_slots").insert(slotInserts);

  // 4. Get ALL non-duplicate targets (full pool — assignments are cleared below)
  const { data: allTargets } = await db
    .from("targets")
    .select("id")
    .eq("is_duplicate", false);

  let remainingTargets = (allTargets || []).map((t: any) => t.id);

  // 5. Apply 5-month cooldown date
  const cooldownDate = new Date();
  cooldownDate.setMonth(cooldownDate.getMonth() - COOLDOWN_MONTHS);

  // 6. Shuffle the full pool
  shuffle(remainingTargets);

  // 7. Clear ALL existing assignments, then reassign from scratch
  await db.from("foia_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const results: any[] = [];

  for (let vi = 0; vi < vas.length; vi++) {
    const va = vas[vi];
    const activeSlot = slotInserts.find((s: any) => s.va_id === va.id && s.is_active);
    const credentialId = activeSlot?.press_account_id;

    // Get cooldown-blocked targets for this credential
    const { data: cooldownEntries } = await db
      .from("credential_target_cooldown")
      .select("target_id")
      .eq("press_account_id", credentialId)
      .gte("used_at", cooldownDate.toISOString());
    const cooledSet = new Set((cooldownEntries || []).map((c: any) => c.target_id));

    // Filter from remaining pool (not on cooldown for this credential)
    const available = remainingTargets.filter((id: string) => !cooledSet.has(id));
    const batch = available.slice(0, BATCH_SIZE);
    const batchSet = new Set(batch);

    // Splice assigned targets out of the shared pool so next VA never sees them
    remainingTargets = remainingTargets.filter((id: string) => !batchSet.has(id));

    // Insert assignments in batches of 200
    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200).map((targetId: string) => ({
        target_id: targetId,
        va_id: va.id,
        assigned_by: va.id,
      }));
      await db.from("foia_assignments").insert(chunk);
    }

    // Create rotation alert
    const credName = pressAccounts.find((p: any) => p.id === credentialId)?.name ?? "Unknown";
    await db.from("rotation_alerts").insert({
      va_id: va.id,
      new_press_account_id: credentialId,
      targets_assigned: batch.length,
      reason: "initial_assignment",
    });

    results.push({
      va: va.full_name,
      credential: credName,
      assigned: batch.length,
    });
  }

  // Send admin email notification
  await sendAdminNotification(db, `Auto-assignment complete: ${results.map(r => `${r.va}: ${r.assigned} targets with ${r.credential}`).join(", ")}`);

  return json({ success: true, results });
}

// ─── CHECK ALL VAs FOR BATCH COMPLETION ──────────────────────────────────────
async function handleCheckAll(db: any, json: Function) {
  const { data: vas } = await db
    .from("foia_profiles")
    .select("id")
    .eq("role", "va")
    .eq("is_active", true);

  const rotated: string[] = [];
  for (const va of (vas || [])) {
    const didRotate = await checkAndRotateVA(db, va.id);
    if (didRotate) rotated.push(va.id);
  }

  return json({ checked: (vas || []).length, rotated });
}

// ─── CHECK SINGLE VA BATCH COMPLETION ────────────────────────────────────────
async function handleCheckBatchCompletion(db: any, vaId: string, json: Function) {
  const didRotate = await checkAndRotateVA(db, vaId);
  return json({ va_id: vaId, rotated: didRotate });
}

// ─── MANUAL ROTATE ───────────────────────────────────────────────────────────
async function handleRotateVA(db: any, vaId: string, reason: string, json: Function) {
  const result = await rotateVACredential(db, vaId, reason);
  return json(result);
}

// ─── CORE: Check if VA's batch is complete and rotate ────────────────────────
async function checkAndRotateVA(db: any, vaId: string): Promise<boolean> {
  // Get current assignments for this VA
  const { data: assignments } = await db
    .from("foia_assignments")
    .select("target_id")
    .eq("va_id", vaId);

  if (!assignments || assignments.length === 0) return false;

  const targetIds = assignments.map((a: any) => a.target_id);

  // Check if all have a terminal status
  const { data: requests } = await db
    .from("foia_requests")
    .select("target_id, status")
    .eq("va_id", vaId)
    .in("target_id", targetIds);

  const terminalStatuses = new Set(["sent", "fulfilled", "rejected"]);
  const completedTargets = new Set<string>();
  for (const req of (requests || [])) {
    if (terminalStatuses.has(req.status)) {
      completedTargets.add(req.target_id);
    }
  }

  // All assigned targets must be completed
  const allComplete = targetIds.every((id: string) => completedTargets.has(id));
  if (!allComplete) return false;

  // Batch is complete — rotate!
  await rotateVACredential(db, vaId, "batch_complete");
  return true;
}

// ─── CORE: Rotate a VA's credential and assign next batch ────────────────────
async function rotateVACredential(db: any, vaId: string, reason: string) {
  // 1. Get current active slot
  const { data: slots } = await db
    .from("va_credential_slots")
    .select("*")
    .eq("va_id", vaId)
    .order("slot_number");

  if (!slots || slots.length === 0)
    return { error: "No credential slots configured for this VA" };

  const activeSlot = slots.find((s: any) => s.is_active);
  if (!activeSlot) return { error: "No active credential slot" };

  const oldCredentialId = activeSlot.press_account_id;

  // 2. Record cooldown for all current assignments
  const { data: currentAssignments } = await db
    .from("foia_assignments")
    .select("target_id")
    .eq("va_id", vaId);

  if (currentAssignments && currentAssignments.length > 0) {
    const cooldownInserts = currentAssignments.map((a: any) => ({
      press_account_id: oldCredentialId,
      target_id: a.target_id,
      used_at: new Date().toISOString(),
    }));

    // Upsert in batches
    for (let i = 0; i < cooldownInserts.length; i += 200) {
      await db
        .from("credential_target_cooldown")
        .upsert(cooldownInserts.slice(i, i + 200), {
          onConflict: "press_account_id,target_id",
        });
    }
  }

  // 3. Deactivate current slot, activate next
  const nextSlotNumber = activeSlot.slot_number < 3 ? activeSlot.slot_number + 1 : 1;
  const nextSlot = slots.find((s: any) => s.slot_number === nextSlotNumber);

  if (!nextSlot) return { error: "Next credential slot not configured" };

  await db.from("va_credential_slots").update({ is_active: false }).eq("id", activeSlot.id);
  await db
    .from("va_credential_slots")
    .update({ is_active: true, batch_number: nextSlot.batch_number + 1 })
    .eq("id", nextSlot.id);

  const newCredentialId = nextSlot.press_account_id;

  // 4. Clear old assignments
  await db.from("foia_assignments").delete().eq("va_id", vaId);

  // 5. Get unassigned targets, filter by cooldown
  const { data: allAssignments } = await db
    .from("foia_assignments")
    .select("target_id");
  const assignedSet = new Set((allAssignments || []).map((a: any) => a.target_id));

  const { data: allTargets } = await db
    .from("targets")
    .select("id")
    .eq("is_duplicate", false);

  let unassigned = (allTargets || [])
    .filter((t: any) => !assignedSet.has(t.id))
    .map((t: any) => t.id);

  // Apply 5-month cooldown for the new credential
  const cooldownDate = new Date();
  cooldownDate.setMonth(cooldownDate.getMonth() - COOLDOWN_MONTHS);

  const { data: cooldownEntries } = await db
    .from("credential_target_cooldown")
    .select("target_id")
    .eq("press_account_id", newCredentialId)
    .gte("used_at", cooldownDate.toISOString());
  const cooledSet = new Set((cooldownEntries || []).map((c: any) => c.target_id));

  unassigned = unassigned.filter((id: string) => !cooledSet.has(id));

  // If no targets available due to cooldown, force-rotate to next credential
  if (unassigned.length === 0) {
    // Already rotated once, try one more
    const furtherSlotNumber = nextSlotNumber < 3 ? nextSlotNumber + 1 : 1;
    if (furtherSlotNumber !== activeSlot.slot_number) {
      await db.from("va_credential_slots").update({ is_active: false }).eq("id", nextSlot.id);
      const furtherSlot = slots.find((s: any) => s.slot_number === furtherSlotNumber);
      if (furtherSlot) {
        await db
          .from("va_credential_slots")
          .update({ is_active: true, batch_number: furtherSlot.batch_number + 1 })
          .eq("id", furtherSlot.id);

        // Create alert about forced rotation
        await db.from("rotation_alerts").insert({
          va_id: vaId,
          old_press_account_id: newCredentialId,
          new_press_account_id: furtherSlot.press_account_id,
          targets_assigned: 0,
          reason: "cooldown_exhausted",
        });
      }
    }

    return { rotated: true, reason: "cooldown_exhausted", assigned: 0 };
  }

  // 6. Shuffle and assign
  shuffle(unassigned);
  const batch = unassigned.slice(0, BATCH_SIZE);

  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200).map((targetId: string) => ({
      target_id: targetId,
      va_id: vaId,
      assigned_by: vaId,
    }));
    await db.from("foia_assignments").insert(chunk);
  }

  // 7. Create rotation alert
  await db.from("rotation_alerts").insert({
    va_id: vaId,
    old_press_account_id: oldCredentialId,
    new_press_account_id: newCredentialId,
    targets_assigned: batch.length,
    reason,
  });

  // 8. Send admin email
  const { data: vaProfile } = await db
    .from("foia_profiles")
    .select("full_name")
    .eq("id", vaId)
    .single();
  const { data: newCred } = await db
    .from("press_accounts")
    .select("name")
    .eq("id", newCredentialId)
    .single();

  await sendAdminNotification(
    db,
    `Credential rotation: ${vaProfile?.full_name ?? vaId} rotated to ${newCred?.name ?? "Unknown"} with ${batch.length} targets (reason: ${reason})`
  );

  return { rotated: true, reason, assigned: batch.length, credential: newCred?.name };
}

// ─── Email notification helper ───────────────────────────────────────────────
async function sendAdminNotification(db: any, message: string) {
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not set, skipping email");
      return;
    }

    // Get admin emails
    const { data: admins } = await db
      .from("foia_profiles")
      .select("email")
      .eq("role", "admin")
      .eq("is_active", true);

    if (!admins || admins.length === 0) return;

    for (const admin of admins) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "FOIA Ops <onboarding@resend.dev>",
          to: admin.email,
          subject: "🔄 FOIA Credential Rotation Alert",
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: #1e293b;">Credential Rotation Alert</h2>
              <p style="color: #475569; font-size: 14px;">${message}</p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                Sent by FOIA Ops auto-rotation system at ${new Date().toISOString()}
              </p>
            </div>
          `,
        }),
      });
    }
  } catch (err) {
    console.error("Failed to send admin notification:", err);
  }
}
