// signal-delta-worker
//
// Consumes pgmq queue 'signal_delta_processing'. For each message:
//   1. Loads property's current state (subset relevant for classification)
//   2. Loads the latest property_snapshot (if any)
//   3. Skips if state hash matches latest snapshot (no-op)
//   4. Calls fn_classify_deltas(prev_state, new_state) — deterministic SQL
//   5. Inserts violation_event + property_snapshot + signal_deltas in order
//   6. Logs to agent_runs (with message_id in metadata for idempotency)
//   7. Deletes message from queue, or moves to DLQ on terminal failure
//
// Strict scope:
//   - NO LLM calls
//   - NO SnapScore changes
//   - NO billing/auth/export changes
//   - NO watchlist fan-out (P1.5)
//   - Coexists with trg_log_new_violation / distress_events
//
// See docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §5, §8, §19.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const AGENT_NAME = "signal_delta_worker";
const QUEUE_LABEL = "pgmq:signal_delta_processing";
const BATCH_SIZE = 10;
const VT_SECONDS = 30;
const MAX_READ_CT = 3;

interface QueueMessage {
  msg_id: number;
  read_ct: number;
  message: {
    action: "inserted" | "updated";
    violation_id: string;
    property_id: string;
    observed_at: string;
  };
}

interface PropertyState {
  snap_score: number | null;
  total_violations: number | null;
  open_violations: number | null;
  oldest_violation_date: string | null;
  newest_violation_date: string | null;
  repeat_offender: boolean | null;
  escalated: boolean | null;
  multi_department: boolean | null;
  distress_signals: string[];
  violation_types: string[];
}

interface ClassifiedDelta {
  delta_type: string;
  severity: number;
  evidence: Record<string, unknown>;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashState(state: PropertyState): string {
  return createHash("md5").update(canonicalJson(state)).digest("hex");
}

async function loadPropertyState(propertyId: string): Promise<PropertyState | null> {
  const { data, error } = await supabase
    .from("properties")
    .select(
      "snap_score, total_violations, open_violations, oldest_violation_date, newest_violation_date, repeat_offender, escalated, multi_department, distress_signals, violation_types",
    )
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    snap_score: data.snap_score,
    total_violations: data.total_violations,
    open_violations: data.open_violations,
    oldest_violation_date: data.oldest_violation_date,
    newest_violation_date: data.newest_violation_date,
    repeat_offender: data.repeat_offender,
    escalated: data.escalated,
    multi_department: data.multi_department,
    distress_signals: Array.isArray(data.distress_signals) ? data.distress_signals : [],
    violation_types: Array.isArray(data.violation_types) ? data.violation_types : [],
  };
}

async function alreadyProcessed(msgId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("agent_name", AGENT_NAME)
    .eq("metadata->>message_id", String(msgId))
    .limit(1);
  if (error) {
    console.warn("[signal-delta-worker] idempotency check failed", error);
    return false;
  }
  return (data ?? []).length > 0;
}

async function processMessage(msg: QueueMessage): Promise<{ status: string; deltas: number }> {
  const { msg_id, message } = msg;
  const { violation_id, property_id, action } = message;
  const startedAt = Date.now();

  if (await alreadyProcessed(msg_id)) {
    return { status: "idempotent_skip", deltas: 0 };
  }

  const { data: runRow, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      agent_name: AGENT_NAME,
      job_table: QUEUE_LABEL,
      job_id: violation_id,
      status: "started",
      input_summary: `${action} violation ${violation_id} -> property ${property_id}`,
      metadata: { message_id: String(msg_id), action },
    })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = runRow!.id as number;

  try {
    const newState = await loadPropertyState(property_id);
    if (!newState) {
      await supabase
        .from("agent_runs")
        .update({
          status: "completed",
          output_summary: "property_not_found",
          duration_ms: Date.now() - startedAt,
        })
        .eq("id", runId);
      return { status: "property_not_found", deltas: 0 };
    }

    const newHash = hashState(newState);

    const { data: priorSnap, error: priorErr } = await supabase
      .from("property_snapshots")
      .select("payload, payload_hash, snapshot_at")
      .eq("property_id", property_id)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priorErr) throw priorErr;

    if (priorSnap && priorSnap.payload_hash === newHash) {
      await supabase
        .from("agent_runs")
        .update({
          status: "completed",
          output_summary: "no_change_skip",
          duration_ms: Date.now() - startedAt,
        })
        .eq("id", runId);
      return { status: "no_change", deltas: 0 };
    }

    const prevState = (priorSnap?.payload ?? {}) as Record<string, unknown>;

    const { data: classified, error: classErr } = await supabase.rpc("fn_classify_deltas", {
      p_prev_state: prevState,
      p_new_state: newState,
    });
    if (classErr) throw classErr;
    const deltas = (classified ?? []) as ClassifiedDelta[];

    const { data: veRow, error: veErr } = await supabase
      .from("violation_events")
      .insert({
        violation_id,
        property_id,
        event_type: action === "inserted" ? "observed" : "status_changed",
        prev_value: priorSnap?.payload ?? null,
        new_value: newState,
        source_run_id: runId,
      })
      .select("id")
      .single();
    if (veErr) throw veErr;

    const { error: snapErr } = await supabase.from("property_snapshots").insert({
      property_id,
      payload: newState,
      payload_hash: newHash,
      source_run_id: runId,
    });
    // 23505 = unique violation: another worker raced us; the existing snapshot
    // is identical so this is safe to ignore.
    if (snapErr && (snapErr as { code?: string }).code !== "23505") throw snapErr;

    if (deltas.length > 0) {
      const deltaRows = deltas.map((d) => ({
        property_id,
        delta_type: d.delta_type,
        severity: d.severity,
        evidence: d.evidence ?? {},
        prev_state: prevState,
        new_state: newState,
        snap_score_before: (prevState as { snap_score?: number | null }).snap_score ?? null,
        snap_score_after: newState.snap_score,
        source_event_id: veRow!.id,
        source_run_id: runId,
      }));
      const { error: deltaErr } = await supabase.from("signal_deltas").insert(deltaRows);
      if (deltaErr) throw deltaErr;
    }

    await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        output_summary: `${deltas.length} deltas, snapshot written`,
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId);

    return { status: "ok", deltas: deltas.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error_message: message,
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId);
    throw err;
  }
}

Deno.serve(async () => {
  const summary = { processed: 0, skipped: 0, no_change: 0, failed: 0, dlq: 0 };

  const { data: messages, error: readErr } = await supabase.rpc("read_signal_delta_batch", {
    p_batch_size: BATCH_SIZE,
    p_vt: VT_SECONDS,
  });
  if (readErr) {
    return new Response(JSON.stringify({ error: readErr.message }), { status: 500 });
  }
  const queue = (messages ?? []) as QueueMessage[];
  if (queue.length === 0) {
    return new Response(JSON.stringify({ summary, message: "queue empty" }));
  }

  for (const msg of queue) {
    try {
      const result = await processMessage(msg);
      if (result.status === "idempotent_skip") summary.skipped++;
      else if (result.status === "no_change") summary.no_change++;
      else summary.processed++;

      const { error: delErr } = await supabase.rpc("delete_signal_delta", {
        p_msg_id: msg.msg_id,
      });
      if (delErr) {
        console.error("[signal-delta-worker] delete_signal_delta failed", {
          msg_id: msg.msg_id,
          error: delErr,
        });
      }
    } catch (err) {
      console.error("[signal-delta-worker] processing failed", {
        msg_id: msg.msg_id,
        read_ct: msg.read_ct,
        error: err instanceof Error ? err.message : String(err),
      });
      summary.failed++;

      if ((msg.read_ct ?? 0) >= MAX_READ_CT) {
        const { error: dlqErr } = await supabase.rpc("move_signal_delta_to_dlq", {
          p_msg_id: msg.msg_id,
          p_payload: {
            ...msg.message,
            _error: err instanceof Error ? err.message : String(err),
            _moved_at: new Date().toISOString(),
          },
        });
        if (dlqErr) {
          console.error("[signal-delta-worker] move_signal_delta_to_dlq failed", {
            msg_id: msg.msg_id,
            error: dlqErr,
          });
        } else {
          summary.dlq++;
        }
      }
      // else: leave on queue; pgmq VT will expire and another worker retries.
    }
  }

  return new Response(JSON.stringify({ summary }));
});
