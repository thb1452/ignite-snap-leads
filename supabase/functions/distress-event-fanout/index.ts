// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Fanout a distress event to all leads attached to the affected property.
 * For each matching lead:
 *   1. Insert a `distress_event` row into lead_activities
 *   2. Send a notification to the lead's owner (assigned_to or created_by)
 *
 * Triggered by either:
 *   - Direct invocation with { event_id } body (manual / pg_net)
 *   - Bulk invocation with { since } ISO timestamp (cron sweep)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const eventId: string | undefined = body.event_id;
    const since: string | undefined = body.since;

    // 1. Load events to process
    let eventsQuery = sb.from("distress_events").select("*");
    if (eventId) {
      eventsQuery = eventsQuery.eq("id", eventId);
    } else if (since) {
      eventsQuery = eventsQuery.gte("detected_at", since).order("detected_at");
    } else {
      // Default: last 5 minutes
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      eventsQuery = eventsQuery.gte("detected_at", fiveMinAgo).order("detected_at");
    }

    const { data: events, error: evErr } = await eventsQuery.limit(500);
    if (evErr) throw evErr;
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let totalActivities = 0;
    let totalNotifications = 0;

    // 2. For each event, find active leads on that property
    for (const event of events) {
      const { data: leads, error: leadsErr } = await sb
        .from("leads")
        .select("id, org_id, assigned_to, created_by, property_id")
        .eq("property_id", event.property_id)
        .is("archived_at", null);

      if (leadsErr) {
        console.error("leads lookup failed", leadsErr);
        continue;
      }
      if (!leads || leads.length === 0) continue;

      // Property snapshot for nicer notification copy
      const { data: prop } = await sb
        .from("properties")
        .select("address, city, state")
        .eq("id", event.property_id)
        .maybeSingle();

      const propLabel = prop
        ? `${prop.address ?? "Property"}${prop.city ? `, ${prop.city}` : ""}`
        : "Your tracked property";

      // 3. Insert lead_activities rows (skip duplicates via unique-ish payload)
      const activityRows = leads.map((lead) => ({
        lead_id: lead.id,
        org_id: lead.org_id,
        actor_id: null,
        activity_type: "distress_event",
        payload: {
          event_id: event.id,
          event_type: event.event_type,
          severity: event.severity,
          delta: event.delta,
          detected_at: event.detected_at,
        },
      }));

      const { error: actErr } = await sb.from("lead_activities").insert(activityRows);
      if (actErr) {
        console.error("activity insert failed", actErr);
      } else {
        totalActivities += activityRows.length;
      }

      // 4. Notify recipients (only critical + warning, dedupe by user)
      if (event.severity === "info") continue;

      const recipients = new Set<string>();
      for (const lead of leads) {
        const target = lead.assigned_to ?? lead.created_by;
        if (target) recipients.add(target);
      }

      const eventTitle =
        event.event_type === "snapscore_change"
          ? `SnapScore ${(event.delta?.direction === "up" ? "jumped" : "dropped")} on ${propLabel}`
          : event.event_type === "new_violation"
            ? `New violation logged on ${propLabel}`
            : `New distress signal on ${propLabel}`;

      const notifRows = Array.from(recipients).map((uid) => ({
        user_id: uid,
        title: eventTitle,
        body:
          event.event_type === "snapscore_change"
            ? `Score went from ${event.delta?.before} to ${event.delta?.after}.`
            : "Open the lead to see the full timeline.",
        link: `/crm/leads`,
      }));

      if (notifRows.length > 0) {
        const { error: notifErr } = await sb.from("notifications").insert(notifRows);
        if (notifErr) {
          console.error("notification insert failed", notifErr);
        } else {
          totalNotifications += notifRows.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        processed: events.length,
        activities_created: totalActivities,
        notifications_sent: totalNotifications,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fanout error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
