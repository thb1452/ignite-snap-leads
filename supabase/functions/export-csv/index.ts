import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CLEAN FIELDS ONLY - Never export raw_description or inspector notes
const CLEAN_EXPORT_COLUMNS = [
  'address',
  'city', 
  'state',
  'zip',
  'violation_type',
  'opened_date',
  'status',
  'snap_summary',
  'snap_score'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const city = url.searchParams.get('city');
    const minScore = url.searchParams.get('minScore');
    const maxScore = url.searchParams.get('maxScore');
    const jurisdictionId = url.searchParams.get('jurisdictionId');
    const propertyIdsParam = url.searchParams.get('propertyIds');
    const propertyIds = propertyIdsParam ? propertyIdsParam.split(',').filter(id => id.trim()) : null;

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

    // ---- Check and Reserve Usage (atomic operation) ----
    let usageConsumed = false;
    try {
      const { data: usageResult, error: usageError } = await supabase.rpc('fn_consume_usage', {
        p_usage_type: 'exports',
        p_amount: 1
      });

      if (usageError) {
        console.log('[export-csv] Usage check failed:', usageError.message);
        // Continue - don't block export if usage tracking fails
      } else if (usageResult && usageResult.allowed === false) {
        console.log('[export-csv] User hit export limit:', user.id);
        return new Response(
          JSON.stringify({
            error: 'CSV export limit reached',
            code: 'EXPORT_LIMIT_EXCEEDED',
            message: usageResult.message || 'You have reached your monthly CSV export limit. Please upgrade your plan to continue exporting.'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (usageResult && usageResult.allowed === true) {
        usageConsumed = true;
        console.log('[export-csv] Usage consumed for user:', user.id, 'remaining:', usageResult.remaining);
      }
    } catch (e) {
      console.log('[export-csv] Usage check skipped:', e.message);
    }

    // Build query - ONLY select clean fields
    let query = supabase
      .from('properties')
      .select(`
        address,
        city,
        state,
        zip,
        snap_insight,
        snap_score,
        violations (
          violation_type,
          status,
          opened_date
        )
      `);

    // Apply filters - propertyIds takes priority
    if (propertyIds && propertyIds.length > 0) {
      query = query.in('id', propertyIds);
    } else {
      if (city) {
        query = query.eq('city', city);
      }
      if (jurisdictionId) {
        query = query.eq('jurisdiction_id', jurisdictionId);
      }
      if (minScore) {
        query = query.gte('snap_score', parseInt(minScore));
      }
      if (maxScore) {
        query = query.lte('snap_score', parseInt(maxScore));
      }
    }

    // Order by snap_score descending (highest motivation first)
    query = query.order('snap_score', { ascending: false, nullsFirst: false });

    // Paginate to get data with hard limit to prevent OOM
    const MAX_EXPORT_ROWS = 50000; // Hard limit to prevent memory issues
    let allData: any[] = [];
    let offset = 0;
    const BATCH_SIZE = 1000;

    while (allData.length < MAX_EXPORT_ROWS) {
      const { data, error } = await query.range(offset, offset + BATCH_SIZE - 1);
      
      if (error) {
        console.error('[export-csv] Query error:', error);
        throw error;
      }

      if (!data || data.length === 0) break;
      
      allData = allData.concat(data);
      
      if (data.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
    
    // Truncate if we hit the limit
    if (allData.length > MAX_EXPORT_ROWS) {
      console.log(`[export-csv] Truncating export from ${allData.length} to ${MAX_EXPORT_ROWS} rows`);
      allData = allData.slice(0, MAX_EXPORT_ROWS);
    }

    console.log(`[export-csv] Exporting ${allData.length} properties for user ${user.id}`);

    // Flatten data for CSV - one row per property with primary violation info
    const csvRows: string[] = [];
    
    // Header row - CLEAN FIELDS ONLY
    csvRows.push(CLEAN_EXPORT_COLUMNS.join(','));

    for (const property of allData) {
      const violations = property.violations || [];
      
      // If property has violations, create one row per violation
      if (violations.length > 0) {
        for (const violation of violations) {
          const row = [
            escapeCSV(property.address || ''),
            escapeCSV(property.city || ''),
            escapeCSV(property.state || ''),
            escapeCSV(property.zip || ''),
            escapeCSV(violation.violation_type || ''),
            escapeCSV(violation.opened_date || ''),
            escapeCSV(normalizeStatus(violation.status)),
            escapeCSV(property.snap_insight || ''),  // Use snap_insight consistently
            property.snap_score?.toString() || ''
          ];
          csvRows.push(row.join(','));
        }
      } else {
        // No violations - still export property
        const row = [
          escapeCSV(property.address || ''),
          escapeCSV(property.city || ''),
          escapeCSV(property.state || ''),
          escapeCSV(property.zip || ''),
          '',  // violation_type
          '',  // opened_date
          '',  // status
          escapeCSV(property.snap_insight || ''),
          property.snap_score?.toString() || ''
        ];
        csvRows.push(row.join(','));
      }
    }

    const csvContent = csvRows.join('\n');

    // Note: Usage already consumed atomically at start via fn_consume_usage
    console.log('[export-csv] Export complete, rows:', csvRows.length - 1, 'usage_tracked:', usageConsumed);

    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="snapignite_export_${Date.now()}.csv"`
      }
    });

  } catch (error) {
    console.error('[export-csv] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
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

// Normalize status to Open/Closed/Unknown
function normalizeStatus(status: string): string {
  if (!status) return 'Unknown';
  const s = status.toLowerCase();
  
  if (s.includes('open') || s.includes('pending') || s.includes('active') || 
      s.includes('in progress') || s.includes('new')) {
    return 'Open';
  }
  
  if (s.includes('closed') || s.includes('resolved') || s.includes('complete') ||
      s.includes('complied') || s.includes('dismissed') || s.includes('abated')) {
    return 'Closed';
  }
  
  return 'Unknown';
}
