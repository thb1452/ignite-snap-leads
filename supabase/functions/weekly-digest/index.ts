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

interface UserDigestData {
  user_id: string;
  email: string;
  full_name: string | null;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
}

interface EmailPrefRow {
  user_id: string;
}

function formatPropertyEmail(
  userName: string | null,
  weeklyCount: number,
  topProperties: TopProperty[]
): string {
  const name = userName || "there";
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
        ${topProperties.map((p, i) => `
          <tr style="border-bottom: 1px solid #e5e5e5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">
                ${i + 1}. ${p.address}
              </div>
              <div style="font-size: 13px; color: #666;">
                ${p.city}, ${p.state}
              </div>
              <div style="font-size: 12px; color: #888; margin-top: 4px;">
                SnapScore: <strong style="color: ${(p.snap_score || 0) >= 70 ? '#dc2626' : (p.snap_score || 0) >= 40 ? '#f59e0b' : '#22c55e'}">${p.snap_score || 0}</strong>
                • ${p.total_violations || 0} violations
                ${p.violation_types?.length ? `• ${p.violation_types[0]}` : ''}
              </div>
            </td>
            <td style="padding: 12px 0; vertical-align: middle; text-align: right; width: 100px;">
              <a href="${APP_URL}/properties?propertyId=${p.id}" 
                 style="display: inline-block; padding: 8px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                View →
              </a>
            </td>
          </tr>
        `).join('')}
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
    const errors: string[] = [];

    const resend = await getResend();

    for (const user of users) {
      try {
        const emailHtml = formatPropertyEmail(user.full_name, weeklyCount, topProperties);
        
        await resend.emails.send({
          from: "Snap Ignite <digest@snapignite.com>",
          to: [user.email],
          subject: `${formattedCount} new enforcement actions this week`,
          html: emailHtml,
        });

        await supabase.from("email_analytics").insert({
          user_id: user.user_id,
          email_type: "weekly_digest",
          email_subject: `${formattedCount} new enforcement actions this week`,
          properties_featured: topProperties.length,
          new_violations_count: weeklyCount
        });

        sentCount++;
        console.log(`Sent digest to ${user.email}`);
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
        failed: errors.length,
        weeklyCount,
        errors: errors.length > 0 ? errors : undefined 
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
