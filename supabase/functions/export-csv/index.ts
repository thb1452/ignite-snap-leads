import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// BACKWARD-COMPATIBLE EXPORT - Original column order preserved
// One row per property with violation data aggregated into original column positions
const EXPORT_COLUMNS = [
  'address',
  'city',
  'state',
  'zip',
  'violation_type',      // Now contains aggregated types (semicolon-separated)
  'opened_date',         // Now contains earliest violation date
  'status',              // Now contains summary: "X open / Y total"
  'snap_summary',
  'snap_score'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Support both GET (small exports) and POST (large exports with many propertyIds)
    // POST is required when propertyIds exceed URL length limits (~2KB)
    let city: string | null = null;
    let minScore: string | null = null;
    let maxScore: string | null = null;
    let jurisdictionId: string | null = null;
    let propertyIds: string[] | null = null;

    if (req.method === 'POST') {
      const body = await req.json();
      city = body.city || null;
      minScore = body.minScore?.toString() || null;
      maxScore = body.maxScore?.toString() || null;
      jurisdictionId = body.jurisdictionId || null;
      propertyIds = Array.isArray(body.propertyIds) ? body.propertyIds : null;
      console.log(`[export-csv] POST request with ${propertyIds?.length || 0} propertyIds`);
    } else {
      const url = new URL(req.url);
      city = url.searchParams.get('city');
      minScore = url.searchParams.get('minScore');
      maxScore = url.searchParams.get('maxScore');
      jurisdictionId = url.searchParams.get('jurisdictionId');
      const propertyIdsParam = url.searchParams.get('propertyIds');
      propertyIds = propertyIdsParam ? propertyIdsParam.split(',').filter(id => id.trim()) : null;
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    // ---- Auth ----
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace("Bearer ", "");

    // Create client with user's token - this respects RLS policies
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const user = authData.user;

    // ---- Get user's subscription (including trial statuses) ----
    const { data: subData } = await supabase
      .from('user_subscriptions')
      .select('status, trial_exports_used, trial_exports_limit, trial_ends_at, plan:subscription_plans(data_tier, max_monthly_exports)')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Reject expired trial users and users with no subscription
    if (!subData) {
      return new Response(
        JSON.stringify({ error: 'No active subscription', code: 'NO_SUBSCRIPTION' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isTrialUser = subData.status === 'trial' || subData.status === 'trialing';

    // Check if trial has expired
    if (isTrialUser && subData.trial_ends_at && new Date(subData.trial_ends_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Trial has expired. Please upgrade to continue exporting.', code: 'TRIAL_EXPIRED' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dataTier = (subData?.plan as any)?.data_tier || 'basic';
    const maxExports = (subData?.plan as any)?.max_monthly_exports || 0;
    console.log('[export-csv] User data tier:', dataTier, 'max exports:', maxExports, 'status:', subData.status);

    // Helper to build a query for filter-based exports (no propertyIds)
    const buildFilterQuery = () => {
      let q = supabase
        .from('properties')
        .select(`
          address,
          city,
          state,
          zip,
          snap_insight,
          snap_score,
          enforcement_type,
          violations (
            violation_type,
            status,
            opened_date
          )
        `);

      if (city) {
        q = q.eq('city', city);
      }
      if (jurisdictionId) {
        q = q.eq('jurisdiction_id', jurisdictionId);
      }
      if (minScore) {
        q = q.gte('snap_score', parseInt(minScore));
      }
      if (maxScore) {
        q = q.lte('snap_score', parseInt(maxScore));
      }

      // CRITICAL: Enforce data tier - basic users can only export code_violation properties
      if (dataTier === 'basic') {
        q = q.eq('enforcement_type', 'code_violation');
      }

      // Order by snap_score descending (highest motivation first)
      q = q.order('snap_score', { ascending: false, nullsFirst: false });

      return q;
    };

    if (dataTier === 'basic') {
      console.log('[export-csv] Filtering to code_violation only (basic tier)');
    }

    const MAX_EXPORT_ROWS = 50000; // Hard limit to prevent memory issues
    let allData: any[] = [];

    // CRITICAL: For propertyIds exports, batch the .in() calls to avoid URL length limits
    // Supabase/PostgREST has URL length limits (~8KB), and 3000+ UUIDs exceed this
    if (propertyIds && propertyIds.length > 0) {
      const ID_BATCH_SIZE = 200; // Safe batch size for UUIDs in URL
      console.log(`[export-csv] Fetching ${propertyIds.length} properties in batches of ${ID_BATCH_SIZE}`);
      
      for (let i = 0; i < propertyIds.length && allData.length < MAX_EXPORT_ROWS; i += ID_BATCH_SIZE) {
        const batchIds = propertyIds.slice(i, i + ID_BATCH_SIZE);
        
        let q = supabase
          .from('properties')
          .select(`
            address,
            city,
            state,
            zip,
            snap_insight,
            snap_score,
            enforcement_type,
            violations (
              violation_type,
              status,
              opened_date
            )
          `)
          .in('id', batchIds);

        // Apply data tier filter
        if (dataTier === 'basic') {
          q = q.eq('enforcement_type', 'code_violation');
        }

        q = q.order('snap_score', { ascending: false, nullsFirst: false });

        const { data, error } = await q;

        if (error) {
          console.error('[export-csv] Query error:', error);
          throw error;
        }

        if (data && data.length > 0) {
          allData = allData.concat(data);
        }
        
        console.log(`[export-csv] Fetched ID batch ${Math.floor(i / ID_BATCH_SIZE) + 1}: got=${data?.length || 0}, total=${allData.length}`);
      }
    } else {
      // Filter-based export: paginate normally
      let offset = 0;
      const BATCH_SIZE = 1000;

      while (allData.length < MAX_EXPORT_ROWS) {
        const { data, error } = await buildFilterQuery().range(offset, offset + BATCH_SIZE - 1);

        if (error) {
          console.error('[export-csv] Query error:', error);
          throw error;
        }

        if (!data || data.length === 0) break;

        allData = allData.concat(data);
        console.log(`[export-csv] Fetched batch: offset=${offset}, got=${data.length}, total=${allData.length}`);

        if (data.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }
    }

    // Truncate if we hit the limit
    if (allData.length > MAX_EXPORT_ROWS) {
      console.log(`[export-csv] Truncating export from ${allData.length} to ${MAX_EXPORT_ROWS} rows`);
      allData = allData.slice(0, MAX_EXPORT_ROWS);
    }

    const exportCount = allData.length;
    console.log(`[export-csv] Exporting ${exportCount} properties for user ${user.id}`);

    // ---- Check and Reserve Usage ----
    if (isTrialUser) {
      // Trial users: check and increment trial exports atomically via DB function
      const trialUsed = subData.trial_exports_used || 0;
      const trialLimit = subData.trial_exports_limit || 50;
      const trialRemaining = trialLimit - trialUsed;

      if (exportCount > trialRemaining) {
        console.log('[export-csv] Trial user hit export limit:', user.id, 'tried:', exportCount, 'remaining:', trialRemaining);
        return new Response(
          JSON.stringify({
            error: 'Trial export limit reached',
            code: 'TRIAL_EXPORT_LIMIT_EXCEEDED',
            message: `Cannot export ${exportCount} properties. You have ${trialRemaining} trial exports remaining. Upgrade to continue.`,
            requested: exportCount,
            remaining: trialRemaining
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Increment trial exports atomically
      const { data: trialResult, error: trialError } = await supabase.rpc('fn_increment_trial_exports', {
        p_user_id: user.id,
        p_count: exportCount
      });

      if (trialError) {
        console.error('[export-csv] Trial export tracking failed:', trialError.message);
        return new Response(
          JSON.stringify({ error: 'Export temporarily unavailable', code: 'USAGE_TRACKING_ERROR' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (trialResult && !trialResult.success) {
        console.log('[export-csv] Trial export denied by DB:', trialResult.error);
        return new Response(
          JSON.stringify({
            error: 'Trial export limit reached',
            code: 'TRIAL_EXPORT_LIMIT_EXCEEDED',
            message: trialResult.error || 'Trial export limit exceeded',
            remaining: trialResult.remaining || 0
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[export-csv] Trial exports consumed:', exportCount, 'for user:', user.id, 'remaining:', trialResult?.remaining);
    } else {
      // Paid users: use the standard usage consumption function
      const { data: usageResult, error: usageError } = await supabase.rpc('fn_consume_usage', {
        p_usage_type: 'exports',
        p_amount: exportCount
      });

      if (usageError) {
        console.error('[export-csv] Usage tracking failed:', usageError.message);
        return new Response(
          JSON.stringify({
            error: 'Export temporarily unavailable',
            code: 'USAGE_TRACKING_ERROR',
            message: 'Unable to process export at this time. Please try again.'
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (usageResult && usageResult.allowed === false) {
        console.log('[export-csv] User hit export limit:', user.id, 'tried to export:', exportCount);
        return new Response(
          JSON.stringify({
            error: 'CSV export limit reached',
            code: 'EXPORT_LIMIT_EXCEEDED',
            message: usageResult.message || `Cannot export ${exportCount} properties. You have reached your monthly limit. Please upgrade your plan to continue exporting.`,
            requested: exportCount,
            remaining: usageResult.remaining || 0
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[export-csv] Usage consumed:', exportCount, 'for user:', user.id, 'remaining:', usageResult?.remaining);
    }

    // FIXED: One row per property with aggregated violations
    // Previously: iterated through each violation creating duplicate property rows
    // Now: aggregate all violation data into single columns per property

    // Initialize CSV rows array with header
    const csvRows: string[] = [];
    csvRows.push(EXPORT_COLUMNS.join(','));

    for (const property of allData) {
      const violations = property.violations || [];

      // Aggregate violation data
      const violationCount = violations.length;
      const openViolationCount = violations.filter((v: any) =>
        ['Open', 'Pending', 'Active', 'In Progress', 'New'].some(s =>
          (v.status || '').toLowerCase().includes(s.toLowerCase())
        )
      ).length;

      // Get unique violation types (semicolon-separated for backward compat)
      const uniqueTypes = [...new Set(violations
        .map((v: any) => v.violation_type)
        .filter(Boolean)
      )].join('; ');

      // Get earliest date
      const dates = violations
        .map((v: any) => v.opened_date)
        .filter(Boolean)
        .sort();
      const earliestDate = dates[0] || '';

      // Status summary: "X open / Y total"
      const statusSummary = `${openViolationCount} open / ${violationCount} total`;

      // ONE row per property - backward-compatible column order
      const row = [
        escapeCSV(property.address || ''),
        escapeCSV(property.city || ''),
        escapeCSV(property.state || ''),
        escapeCSV(property.zip || ''),
        escapeCSV(uniqueTypes),           // violation_type column
        escapeCSV(earliestDate),          // opened_date column
        escapeCSV(statusSummary),         // status column
        escapeCSV(property.snap_insight || ''),
        property.snap_score?.toString() || ''
      ];
      csvRows.push(row.join(','));
    }

    // Defensive check: exported rows should equal properties count + 1 header
    const expectedRows = allData.length + 1;
    if (csvRows.length !== expectedRows) {
      console.error(`[export-csv] ROW COUNT MISMATCH: expected ${expectedRows}, got ${csvRows.length}`);
    }

    console.log('[export-csv] Export complete - properties:', allData.length, 'rows:', csvRows.length - 1);

    const csvContent = csvRows.join('\n');

    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="snapignite_export_${Date.now()}.csv"`,
        'X-Export-Property-Count': allData.length.toString()
      }
    });

  } catch (error) {
    console.error('[export-csv] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Escape CSV field — also neutralize formula-injection characters
// Excel/Sheets execute formulas starting with =, +, -, @, |, \t
function escapeCSV(value: string): string {
  if (!value) return '';

  let safe = value;
  // Prepend a tab character to defuse formula injection
  if (/^[=+\-@|\t]/.test(safe)) {
    safe = '\t' + safe;
  }

  // If value contains comma, newline, or quote, wrap in quotes and escape quotes
  if (safe.includes(',') || safe.includes('\n') || safe.includes('"')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
