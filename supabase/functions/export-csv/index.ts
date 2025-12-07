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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // Apply filters
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

    // Order by snap_score descending (highest motivation first)
    query = query.order('snap_score', { ascending: false, nullsFirst: false });

    // Paginate to get all data
    let allData: any[] = [];
    let offset = 0;
    const BATCH_SIZE = 1000;

    while (true) {
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

    console.log(`[export-csv] Exporting ${allData.length} properties`);

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
