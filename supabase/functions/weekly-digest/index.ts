import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const APP_URL = Deno.env.get("APP_URL") || "https://app.snapignite.com";

// Dynamic import for Resend to avoid build issues
async function getResend() {
  const { Resend } = await import("https://esm.sh/resend@2.0.0");
  return new Resend(Deno.env.get("RESEND_API_KEY"));
}

interface TopProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  snap_score: number | null;
  total_violations: number | null;
  violation_types: string[] | null;
}

interface WatchlistEventRow {
  event_id: string;
  signal_delta_id: string;
  property_id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  snap_score: number | null;
  delta_type: string;
  severity: number;
  source: string;
  created_at: string;
}

interface UserDigestData {
  user_id: string;
  email: string;
  full_name: string | null;
}

// Maps signal_delta_type enum values to short, evidence-grounded labels.
// Kept in lockstep with the enum in
// supabase/migrations/20260508000000_p1_freshness_foundation_schema.sql.
function deltaTypeLabel(deltaType: string): string {
  switch (deltaType) {
    case "new_open_violation":                return "New violation filed";
    case "enforcement_escalation":            return "Enforcement escalated";
    case "water_shutoff_added":               return "Water shutoff added";
    case "repeat_offender_threshold_crossed": return "Repeat-offender threshold crossed";
    case "extended_enforcement_milestone":    return "Long-open milestone reached";
    case "closed_after_long_open":            return "Closed after long open";
    default: return deltaType.replaceAll("_", " ");
  }
}

function severityBadgeColor(severity: number): string {
  if (severity >= 80) return "#dc2626"; // red
  if (severity >= 60) return "#f59e0b"; // amber
  return "#6b7280";                      // gray
}

// Cap on watchlist events surfaced per email; mirrors p_limit in the
// fn_top_watchlist_events_for_user RPC call below. When the user has more
// unread events than this cap we honestly indicate "N+" in both subject
// and body so the reader knows additional events exist.
const WATCHLIST_EVENT_CAP = 5;

// Minimal HTML entity escaping for values interpolated into email markup.
// Treats null/undefined as empty string so callers don't need to guard.
function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
}

interface EmailPrefRow {
  user_id: string;
}

function formatWatchlistEmail(
  userName: string | null,
  events: WatchlistEventRow[]
): string {
  const name = escapeHtml(userName || "there");
  const eventCount = events.length;
  const isAtCap = eventCount >= WATCHLIST_EVENT_CAP;
  const countDisplay = isAtCap ? `${eventCount}+` : String(eventCount);
  const propertyWord = eventCount === 1 ? "property" : "properties";

  const eventsHtml = events.map((e, i) => {
    const label = escapeHtml(deltaTypeLabel(e.delta_type));
    const sevColor = severityBadgeColor(e.severity);
    const addr = escapeHtml(e.address || "Address unavailable");
    const cityLine = escapeHtml([e.city, e.state].filter(Boolean).join(", "));
    const severity = escapeHtml(e.severity);
    const snapScore = e.snap_score !== null ? escapeHtml(e.snap_score) : null;
    const propertyHref = `${APP_URL}/properties?propertyId=${encodeURIComponent(e.property_id)}`;
    return `
      <tr style="border-bottom: 1px solid #e5e5e5;">
        <td style="padding: 12px 0; vertical-align: top;">
          <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">
            ${i + 1}. ${addr}
          </div>
          <div style="font-size: 13px; color: #666;">
            ${cityLine}
          </div>
          <div style="font-size: 12px; margin-top: 4px;">
            <span style="color: #1a1a1a; font-weight: 500;">${label}</span>
            <span style="color: #888;"> · </span>
            <span style="color: ${sevColor}; font-weight: 600;">Severity ${severity}</span>
            ${snapScore !== null ? `<span style="color: #888;"> · SnapScore ${snapScore}</span>` : ""}
          </div>
        </td>
        <td style="padding: 12px 0; vertical-align: middle; text-align: right; width: 100px;">
          <a href="${propertyHref}"
             style="display: inline-block; padding: 8px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
            View →
          </a>
        </td>
      </tr>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${APP_URL}/logo.jpg" alt="Snap Ignite" style="height: 40px; width: auto;">
  </div>

  <p style="font-size: 15px; margin-bottom: 8px;">Hey ${name},</p>

  <p style="font-size: 15px; margin-bottom: 24px;">
    ${countDisplay} ${propertyWord} on your watchlist had meaningful pressure changes this week. Highest severity first:
  </p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    ${eventsHtml}
  </table>

  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5;">
    <a href="${APP_URL}/saved"
       style="display: block; text-align: center; padding: 14px 24px; background: #111; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Open your watchlist →
    </a>
  </div>

  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #888; text-align: center;">
    <p>
      You're receiving this because you have an active Snap Ignite account.<br>
      <a href="${APP_URL}/settings" style="color: #666;">Manage email preferences</a>
    </p>
    <p style="margin-top: 8px;">
      © ${new Date().getFullYear()} Snap Ignite. All rights reserved.
    </p>
  </div>

</body>
</html>
  `.trim();
}

function formatPropertyEmail(
  userName: string | null,
  weeklyCount: number,
  topProperties: TopProperty[]
): string {
  const name = escapeHtml(userName || "there");
  const formattedCount = weeklyCount >= 1000
    ? `${Math.round(weeklyCount / 100) * 100}+`
    : weeklyCount.toString();

  let propertiesHtml = "";
  if (topProperties.length > 0) {
    propertiesHtml = `
      <h2 style="font-size: 16px; font-weight: 600; margin: 24px 0 12px 0; color: #1a1a1a;">
        🔥 Top Opportunities This Week
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        ${topProperties.map((p, i) => {
          const score = p.snap_score || 0;
          const scoreColor = score >= 70 ? '#dc2626' : score >= 40 ? '#f59e0b' : '#22c55e';
          const addr = escapeHtml(p.address);
          const cityLine = escapeHtml([p.city, p.state].filter(Boolean).join(", "));
          const violations = escapeHtml(p.total_violations || 0);
          const firstType = p.violation_types?.length ? escapeHtml(p.violation_types[0]) : null;
          const propertyHref = `${APP_URL}/properties?propertyId=${encodeURIComponent(p.id)}`;
          return `
          <tr style="border-bottom: 1px solid #e5e5e5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">
                ${i + 1}. ${addr}
              </div>
              <div style="font-size: 13px; color: #666;">
                ${cityLine}
              </div>
              <div style="font-size: 12px; color: #888; margin-top: 4px;">
                SnapScore: <strong style="color: ${scoreColor}">${escapeHtml(score)}</strong>
                • ${violations} violations
                ${firstType ? `• ${firstType}` : ''}
              </div>
            </td>
            <td style="padding: 12px 0; vertical-align: middle; text-align: right; width: 100px;">
              <a href="${propertyHref}"
                 style="display: inline-block; padding: 8px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                View →
              </a>
            </td>
          </tr>
        `;
        }).join('')}
      </table>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${APP_URL}/logo.jpg" alt="Snap Ignite" style="height: 40px; width: auto;">
  </div>

  <p style="font-size: 15px; margin-bottom: 8px;">Hey ${name},</p>
  
  <p style="font-size: 15px; margin-bottom: 24px;">
    Here's your weekly intelligence briefing from Snap Ignite.
  </p>

  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
    <div style="font-size: 48px; font-weight: 700; color: white; margin-bottom: 4px;">
      ${formattedCount}
    </div>
    <div style="font-size: 14px; color: rgba(255,255,255,0.9);">
      new enforcement actions added this week
    </div>
  </div>

  ${propertiesHtml}

  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5;">
    <a href="${APP_URL}/leads" 
       style="display: block; text-align: center; padding: 14px 24px; background: #111; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
      View All Properties →
    </a>
  </div>

  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #888; text-align: center;">
    <p>
      You're receiving this because you have an active Snap Ignite account.<br>
      <a href="${APP_URL}/settings" style="color: #666;">Manage email preferences</a>
    </p>
    <p style="margin-top: 8px;">
      © ${new Date().getFullYear()} Snap Ignite. All rights reserved.
    </p>
  </div>

</body>
</html>
  `.trim();
}

/**
 * Selects a diverse set of properties across score tiers and cities.
 * Instead of showing 5 properties all at score 100, this picks from
 * different score buckets and avoids repeating the same city.
 */
function selectDiverseProperties(properties: any[], count: number): any[] {
  if (properties.length <= count) return properties;

  const selected: any[] = [];
  const usedCities = new Set<string>();

  // Define score tiers: 80-100, 60-79, 40-59, 20-39, 0-19
  const tiers = [
    { min: 80, max: 100 },
    { min: 60, max: 79 },
    { min: 40, max: 59 },
    { min: 20, max: 39 },
    { min: 0, max: 19 },
  ];

  // First pass: pick the best from each tier, preferring unique cities
  for (const tier of tiers) {
    if (selected.length >= count) break;
    const tierCandidates = properties.filter(
      (p) => (p.snap_score ?? 0) >= tier.min && (p.snap_score ?? 0) <= tier.max
    );
    // Prefer a city we haven't used yet
    const uniqueCity = tierCandidates.find(
      (p) => !usedCities.has(`${p.city}-${p.state}`)
    );
    const pick = uniqueCity || tierCandidates[0];
    if (pick && !selected.some((s) => s.id === pick.id)) {
      selected.push(pick);
      usedCities.add(`${pick.city}-${pick.state}`);
    }
  }

  // Second pass: fill remaining slots from highest-scored unused properties
  // preferring unique cities
  if (selected.length < count) {
    const remaining = properties.filter((p) => !selected.some((s) => s.id === p.id));
    for (const p of remaining) {
      if (selected.length >= count) break;
      if (!usedCities.has(`${p.city}-${p.state}`)) {
        selected.push(p);
        usedCities.add(`${p.city}-${p.state}`);
      }
    }
  }

  // Final fill: if still under count, add any remaining by score
  if (selected.length < count) {
    const remaining = properties.filter((p) => !selected.some((s) => s.id === p.id));
    for (const p of remaining) {
      if (selected.length >= count) break;
      selected.push(p);
    }
  }

  // Sort final selection by score descending for display
  return selected.sort((a, b) => (b.snap_score ?? 0) - (a.snap_score ?? 0));
}

async function getWeeklyStats(supabaseUrl: string, supabaseServiceKey: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { count: weeklyCount } = await supabase
    .from("violations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo.toISOString());

  // Fetch a larger pool for diversity selection
  const { data: candidateProperties } = await supabase
    .from("properties")
    .select("id, address, city, state, snap_score, total_violations, violation_types, escalated, open_violations")
    .gte("updated_at", sevenDaysAgo.toISOString())
    .not("snap_score", "is", null)
    .order("snap_score", { ascending: false })
    .order("total_violations", { ascending: false })
    .limit(100);

  // Filter out parcel IDs and non-street addresses
  const validProperties = (candidateProperties || []).filter((p: any) => {
    const addr = (p.address || "").trim();
    if (!addr) return false;
    if (/^parcel[- ]based/i.test(addr)) return false;
    if (/^[\d]+[-.][\d\-.]+$/.test(addr)) return false;
    if (!/[a-zA-Z]/.test(addr)) return false;
    return true;
  });

  // Select diverse top-5 across score tiers and cities
  const topProperties = selectDiverseProperties(validProperties, 5);

  return {
    weeklyCount: weeklyCount || 0,
    topProperties: (topProperties || []) as TopProperty[]
  };
}

async function getUserWatchlistEvents(
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string,
): Promise<WatchlistEventRow[]> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.rpc("fn_top_watchlist_events_for_user", {
    p_user_id: userId,
    p_window_days: 7,
    p_limit: 5,
  });
  if (error) {
    console.warn(`[weekly-digest] watchlist query failed for ${userId}:`, error);
    return [];
  }
  return (data ?? []) as WatchlistEventRow[];
}

async function getActiveUsers(supabaseUrl: string, supabaseServiceKey: string): Promise<UserDigestData[]> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const allUsers: UserDigestData[] = [];
  let page = 1;
  const perPage = 1000;
  
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Error listing auth users:", error);
      break;
    }
    if (!users || users.length === 0) break;
    
    for (const u of users) {
      if (u.email) {
        allUsers.push({
          user_id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || null,
        });
      }
    }
    
    if (users.length < perPage) break;
    page++;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name");
  
  const profileNames = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
  for (const u of allUsers) {
    if (!u.full_name && profileNames.has(u.user_id)) {
      u.full_name = profileNames.get(u.user_id);
    }
  }

  const { data: disabledPrefs } = await supabase
    .from("email_preferences")
    .select("user_id")
    .eq("weekly_digest_enabled", false);

  const disabledUserIds = new Set((disabledPrefs as EmailPrefRow[] || []).map(p => p.user_id));

  return allUsers.filter(u => !disabledUserIds.has(u.user_id));
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require x-internal-secret matching service role key OR cron token
    const internalSecret = req.headers.get("x-internal-secret");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronToken = "snap-ignite-digest-cron-2026";
    
    if (!internalSecret || (internalSecret !== serviceRoleKey && internalSecret !== cronToken)) {
      // Also allow admin JWT as fallback
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
      
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", claimsData.claims.sub)
        .eq("role", "admin")
        .maybeSingle();
      
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional force flag from body
    let forceRun = false;
    try {
      const body = await req.clone().json();
      forceRun = body?.force === true;
    } catch { /* no body or not JSON */ }

    // Guard: only send on Mondays (day 1) unless explicitly forced
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dayOfWeek = nowET.getDay(); // 0=Sun, 1=Mon
    if (dayOfWeek !== 1 && !forceRun) {
      console.log(`Skipping digest: today is day ${dayOfWeek} (not Monday). Pass {"force": true} to override.`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Not Monday. Pass {\"force\": true} to override." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Dedup guard: check if digest was already sent today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: alreadySentToday } = await supabase
      .from("email_analytics")
      .select("*", { count: "exact", head: true })
      .eq("email_type", "weekly_digest")
      .gte("sent_at", todayStart.toISOString());

    if ((alreadySentToday || 0) > 0 && !forceRun) {
      console.log(`Digest already sent today (${alreadySentToday} records). Skipping.`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Already sent today (${alreadySentToday} records)` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { weeklyCount, topProperties } = await getWeeklyStats(supabaseUrl, supabaseServiceKey);
    console.log(`Weekly stats: ${weeklyCount} violations, ${topProperties.length} top properties`);

    const users = await getActiveUsers(supabaseUrl, supabaseServiceKey);
    console.log(`Sending digest to ${users.length} users`);

    if (users.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No users to send to", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const formattedCount = weeklyCount >= 1000 
      ? `${Math.round(weeklyCount / 100) * 100}+` 
      : weeklyCount.toString();

    let sentCount = 0;
    let watchlistVariantSent = 0;
    let fallbackVariantSent = 0;
    const errors: string[] = [];

    const resend = await getResend();

    for (const user of users) {
      try {
        // Prefer per-user watchlist content if the user has unseen events
        // from the last 7 days. Fall back to system-wide top-5 only when
        // the watchlist stream is empty for this user.
        const events = await getUserWatchlistEvents(supabaseUrl, supabaseServiceKey, user.user_id);
        const useWatchlist = events.length > 0;

        // When the user has more unread events than the cap, surface "+"
        // honestly so the subject doesn't understate the actual delta count.
        const isAtCap = events.length >= WATCHLIST_EVENT_CAP;
        const watchlistCountDisplay = isAtCap ? `${events.length}+` : String(events.length);
        const watchlistChangeWord = events.length === 1 ? "change" : "changes";
        const subject = useWatchlist
          ? `${watchlistCountDisplay} ${watchlistChangeWord} in your Snap Ignite watchlist this week`
          : `${formattedCount} new enforcement actions this week`;

        const emailHtml = useWatchlist
          ? formatWatchlistEmail(user.full_name, events)
          : formatPropertyEmail(user.full_name, weeklyCount, topProperties);

        await resend.emails.send({
          from: "Snap Ignite <digest@snapignite.com>",
          to: [user.email],
          subject,
          html: emailHtml,
        });

        await supabase.from("email_analytics").insert({
          user_id: user.user_id,
          email_type: "weekly_digest",
          email_subject: subject,
          properties_featured: useWatchlist ? events.length : topProperties.length,
          new_violations_count: weeklyCount,
        });

        sentCount++;
        if (useWatchlist) watchlistVariantSent++;
        else fallbackVariantSent++;
        console.log(`Sent ${useWatchlist ? "watchlist" : "fallback"} digest to ${user.email}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to send to ${user.email}:`, errorMsg);
        errors.push(`${user.email}: ${errorMsg}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        watchlist_variant: watchlistVariantSent,
        fallback_variant: fallbackVariantSent,
        failed: errors.length,
        weeklyCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Weekly digest error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
