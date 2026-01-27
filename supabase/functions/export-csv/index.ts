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

    // ---- Get user's data tier from subscription ----
    const { data: subData } = await supabase
      .from('user_subscriptions')
      .select('plan:subscription_plans(data_tier, max_monthly_exports)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    const dataTier = (subData?.plan as any)?.data_tier || 'basic';
    const maxExports = (subData?.plan as any)?.max_monthly_exports || 0;
    console.log('[export-csv] User data tier:', dataTier, 'max exports:', maxExports);

    // Helper to build a fresh query each time (Supabase query builder is mutable)
    const buildBaseQuery = () => {
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

      // Apply filters - propertyIds takes priority
      if (propertyIds && propertyIds.length > 0) {
        q = q.in('id', propertyIds);
      } else {
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

    // Paginate to get data with hard limit to prevent OOM
    const MAX_EXPORT_ROWS = 50000; // Hard limit to prevent memory issues
    let allData: any[] = [];
    let offset = 0;
    const BATCH_SIZE = 1000;

    while (allData.length < MAX_EXPORT_ROWS) {
      // CRITICAL: Build fresh query each iteration - Supabase query builder is mutable!
      const { data, error } = await buildBaseQuery().range(offset, offset + BATCH_SIZE - 1);

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

    // Truncate if we hit the limit
    if (allData.length > MAX_EXPORT_ROWS) {
      console.log(`[export-csv] Truncating export from ${allData.length} to ${MAX_EXPORT_ROWS} rows`);
      allData = allData.slice(0, MAX_EXPORT_ROWS);
    }

    const exportCount = allData.length;
    console.log(`[export-csv] Exporting ${exportCount} properties for user ${user.id}`);

    // ---- Check and Reserve Usage (atomic operation) ----
    // CRITICAL: Consume usage AFTER we know the actual export count
    // This ensures we track the actual number of properties exported, not just "1 export"
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

// Escape CSV field
function escapeCSV(value: string): string {
  if (!value) return '';
  // If value contains comma, newline, or quote, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
