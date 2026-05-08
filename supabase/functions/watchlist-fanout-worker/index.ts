// watchlist-fanout-worker
//
// Consumes pgmq queue 'watchlist_event_fanout'. For each message
// (signal_delta_id, property_id, delta_type, severity), finds the users
// who care about this property + delta and inserts watchlist_intelligence_events
// rows on their behalf.
//
// P1.5 v0 sources (matched in priority order — first match wins per user):
//   1. saved_property — user has the property in saved_properties
//   2. list           — user has a lead_lists row whose list_properties contains the property
//
// NOT yet matched (deferred to P1.6):
//   3. saved_market   — user's saved_markets.filter_payload matches the property
//                       (needs fn_property_matches_filter)
//
// Per-user severity threshold:
//   - Read user_signal_preferences row for (user_id, delta_type)
//   - If suppressed=true → skip
//   - If weight=W, only emit if message severity >= W (default 50)
//
// Idempotent on (agent_name='watchlist_fanout_worker', metadata.message_id).
// DLQ after read_ct >= 3.
//
// Strict scope:
//   - NO LLM, NO SnapScore changes, NO billing/auth/export changes
//   - NO digest rewrite, NO frontend changes
//   - Coexists with P1 #161 signal-delta-worker (different queue, different table)
//
// See docs/SNAP_INTELLIGENCE_ARCHITECTURE_2026.md §6.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const AGENT_NAME = "watchlist_fanout_worker";
const QUEUE_LABEL = "pgmq:watchlist_event_fanout";
const BATCH_SIZE = 10;
const VT_SECONDS = 30;
const MAX_READ_CT = 3;
const DEFAULT_SEVERITY_THRESHOLD = 50;

interface QueueMessage {
  msg_id: number;
  read_ct: number;
  message: {
    signal_delta_id: string;
    property_id: string;
    delta_type: string;
    severity: number;
    detected_at: string;
  };
}

interface UserSignalPreference {
  weight: number;
  suppressed: boolean;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function alreadyProcessed(msgId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("agent_name", AGENT_NAME)
    .eq("metadata->>message_id", String(msgId))
    .limit(1);
  if (error) {
    console.warn("[watchlist-fanout-worker] idempotency check failed", error);
    return false;
  }
  return (data ?? []).length > 0;
}

async function findSavedPropertyUsers(propertyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("saved_properties")
    .select("user_id")
    .eq("property_id", propertyId);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
}

interface ListMatch {
  user_id: string;
  list_id: string;
}

async function findListUsers(propertyId: string): Promise<ListMatch[]> {
  // service_role bypasses RLS so this returns all matching rows regardless of owner.
  const { data, error } = await supabase
    .from("list_properties")
    .select("list_id, lead_lists!inner(id, user_id)")
    .eq("property_id", propertyId);
  if (error) throw error;
  const out: ListMatch[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    // supabase-js returns the joined row as an object; coerce defensively.
    const ll = (row as { lead_lists?: { id?: string; user_id?: string } | null }).lead_lists;
    const userId = ll?.user_id;
    const listId = ll?.id ?? (row as { list_id?: string }).list_id;
    if (!userId || !listId) continue;
    const key = `${userId}:${listId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ user_id: userId, list_id: listId });
  }
  return out;
}

async function loadUserPreferences(
  userIds: string[],
  deltaType: string,
): Promise<Map<string, UserSignalPreference>> {
  const result = new Map<string, UserSignalPreference>();
  if (userIds.length === 0) return result;
  const { data, error } = await supabase
    .from("user_signal_preferences")
    .select("user_id, weight, suppressed")
    .in("user_id", userIds)
    .eq("delta_type", deltaType);
  if (error) throw error;
  for (const row of data ?? []) {
    result.set(row.user_id as string, {
      weight: row.weight as number,
      suppressed: row.suppressed as boolean,
    });
  }
  return result;
}

interface Candidate {
  user_id: string;
  source: "saved_property" | "list";
  source_id: string | null;
}

async function processMessage(msg: QueueMessage): Promise<{ status: string; emitted: number }> {
  const { msg_id, message } = msg;
  const { signal_delta_id, property_id, delta_type, severity } = message;
  const startedAt = Date.now();

  if (await alreadyProcessed(msg_id)) {
    return { status: "idempotent_skip", emitted: 0 };
  }

  const { data: runRow, error: runErr } = await supabase
    .from("agent_runs")
    .insert({
      agent_name: AGENT_NAME,
      job_table: QUEUE_LABEL,
      job_id: signal_delta_id,
      status: "started",
      input_summary: `delta ${delta_type} sev=${severity} property=${property_id}`,
      metadata: { message_id: String(msg_id), signal_delta_id, delta_type },
    })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = runRow!.id as number;

  try {
    // Find candidate users via the two P1.5 sources. saved_property is more
    // specific than list; if a user appears in both, saved_property wins
    // and the list source is skipped (the unique index prevents collision).
    const [savedUserIds, listMatches] = await Promise.all([
      findSavedPropertyUsers(property_id),
      findListUsers(property_id),
    ]);

    const candidatesByUser = new Map<string, Candidate>();
    for (const userId of savedUserIds) {
      candidatesByUser.set(userId, {
        user_id: userId,
        source: "saved_property",
        source_id: null,
      });
    }
    for (const match of listMatches) {
      if (!candidatesByUser.has(match.user_id)) {
        candidatesByUser.set(match.user_id, {
          user_id: match.user_id,
          source: "list",
          source_id: match.list_id,
        });
      }
    }

    const candidates = Array.from(candidatesByUser.values());
    if (candidates.length === 0) {
      await supabase
        .from("agent_runs")
        .update({
          status: "completed",
          output_summary: "no_matching_users",
          duration_ms: Date.now() - startedAt,
        })
        .eq("id", runId);
      return { status: "no_users", emitted: 0 };
    }

    const prefs = await loadUserPreferences(
      candidates.map((c) => c.user_id),
      delta_type,
    );

    const rowsToInsert = candidates
      .filter((c) => {
        const pref = prefs.get(c.user_id);
        if (pref?.suppressed) return false;
        const threshold = pref?.weight ?? DEFAULT_SEVERITY_THRESHOLD;
        return severity >= threshold;
      })
      .map((c) => ({
        user_id: c.user_id,
        source: c.source,
        source_id: c.source_id,
        signal_delta_id,
        property_id,
        delta_type,
        severity,
      }));

    let emitted = 0;
    if (rowsToInsert.length > 0) {
      // ON CONFLICT (user_id, signal_delta_id, source) DO NOTHING — handled
      // by the unique index in the schema migration. supabase-js v2 does not
      // expose an upsert-with-do-nothing primitive cleanly; the unique index
      // raises 23505 which we swallow.
      const { error: insErr, data: inserted } = await supabase
        .from("watchlist_intelligence_events")
        .insert(rowsToInsert)
        .select("id");
      if (insErr) {
        // 23505 = unique violation: another worker raced or this delta was
        // already fanned out. Safe to treat as success.
        const code = (insErr as { code?: string }).code;
        if (code !== "23505") throw insErr;
      }
      emitted = inserted?.length ?? 0;
    }

    await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        output_summary: `${emitted} events emitted across ${candidates.length} candidate users`,
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId);

    return { status: "ok", emitted };
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
  const summary = { processed: 0, skipped: 0, no_users: 0, failed: 0, dlq: 0, emitted: 0 };

  const { data: messages, error: readErr } = await supabase.rpc("read_watchlist_fanout_batch", {
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
      else if (result.status === "no_users") summary.no_users++;
      else summary.processed++;
      summary.emitted += result.emitted;

      const { error: delErr } = await supabase.rpc("delete_watchlist_fanout", {
        p_msg_id: msg.msg_id,
      });
      if (delErr) {
        console.error("[watchlist-fanout-worker] delete_watchlist_fanout failed", {
          msg_id: msg.msg_id,
          error: delErr,
        });
      }
    } catch (err) {
      console.error("[watchlist-fanout-worker] processing failed", {
        msg_id: msg.msg_id,
        read_ct: msg.read_ct,
        error: err instanceof Error ? err.message : String(err),
      });
      summary.failed++;

      if ((msg.read_ct ?? 0) >= MAX_READ_CT) {
        const { error: dlqErr } = await supabase.rpc("move_watchlist_fanout_to_dlq", {
          p_msg_id: msg.msg_id,
          p_payload: {
            ...msg.message,
            _error: err instanceof Error ? err.message : String(err),
            _moved_at: new Date().toISOString(),
          },
        });
        if (dlqErr) {
          console.error("[watchlist-fanout-worker] move_watchlist_fanout_to_dlq failed", {
            msg_id: msg.msg_id,
            error: dlqErr,
          });
        } else {
          summary.dlq++;
        }
      }
      // else: leave on queue for retry (pgmq VT will expire).
    }
  }

  return new Response(JSON.stringify({ summary }));
});
