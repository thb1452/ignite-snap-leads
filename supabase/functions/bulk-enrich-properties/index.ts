// Supabase Edge Function: bulk-enrich-properties
//
// Admin-only endpoint that processes a CSV of property enrichment data
// (beds, baths, sqft, year_built, lot_size_sqft) and updates matching
// properties by normalized address+city+state.
//
// Body: { jobId: string, csvText: string }
// Auth: Bearer <user_jwt> with admin role

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnrichRow {
  address: string;
  city: string;
  state: string;
  zip?: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  year_built?: number | null;
  lot_size_sqft?: number | null;
  _rowNum: number;
}

const CHUNK_SIZE = 500;

function normalizeAddress(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result.map((s) => s.trim());
}

function toIntOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function toNumOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseCSV(text: string): { rows: EnrichRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ["CSV is empty or has no data rows"] };

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  const required = ["address", "city", "state"];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length) return { rows: [], errors: [`Missing required columns: ${missing.join(", ")}`] };

  const idx = (name: string) => headers.indexOf(name);
  const rows: EnrichRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const address = cols[idx("address")] || "";
    const city = cols[idx("city")] || "";
    const state = (cols[idx("state")] || "").toUpperCase();

    if (!address || !city || !state) {
      errors.push(`Row ${i + 1}: missing address/city/state`);
      continue;
    }

    rows.push({
      address,
      city,
      state,
      zip: idx("zip") >= 0 ? cols[idx("zip")] : undefined,
      beds: idx("beds") >= 0 ? toIntOrNull(cols[idx("beds")]) : null,
      baths: idx("baths") >= 0 ? toNumOrNull(cols[idx("baths")]) : null,
      sqft: idx("sqft") >= 0 ? toIntOrNull(cols[idx("sqft")]) : null,
      year_built: idx("year_built") >= 0 ? toIntOrNull(cols[idx("year_built")]) : null,
      lot_size_sqft: idx("lot_size_sqft") >= 0 ? toIntOrNull(cols[idx("lot_size_sqft")]) : null,
      _rowNum: i + 1,
    });
  }
  return { rows, errors };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  if (!jwt) {
    return new Response(JSON.stringify({ error: "Missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);

  // Verify caller is admin
  const { data: userResp } = await admin.auth.getUser(jwt);
  const userId = userResp?.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Admin role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { jobId: string; csvText: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { jobId, csvText } = body;
  if (!jobId || !csvText) {
    return new Response(JSON.stringify({ error: "jobId and csvText required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mark job as processing
  await admin
    .from("property_enrichment_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId);

  // Parse CSV
  const { rows, errors } = parseCSV(csvText);
  if (errors.length && rows.length === 0) {
    await admin
      .from("property_enrichment_jobs")
      .update({
        status: "failed",
        error_message: errors.join("; "),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return new Response(JSON.stringify({ error: errors.join("; ") }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin
    .from("property_enrichment_jobs")
    .update({ total_rows: rows.length })
    .eq("id", jobId);

  let matched = 0;
  let updated = 0;
  let unmatched = 0;
  let processed = 0;
  const unmatchedRows: EnrichRow[] = [];
  const sourceTag = `csv_upload_${jobId.slice(0, 8)}`;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    // Build OR query for this chunk to find matching properties
    // We fetch by city+state then filter in-memory for normalized address match
    const cityStatePairs = new Set(chunk.map((r) => `${normalizeAddress(r.city)}|${r.state}`));
    const cities = [...new Set(chunk.map((r) => r.city))];
    const states = [...new Set(chunk.map((r) => r.state))];

    const { data: candidates, error: fetchErr } = await admin
      .from("properties")
      .select("id, address, city, state")
      .in("state", states)
      .in("city", cities);

    if (fetchErr) {
      console.error("[bulk-enrich] fetch error", fetchErr);
      continue;
    }

    // Build lookup: normalized addr+city+state → property id
    const lookup = new Map<string, string>();
    for (const c of candidates ?? []) {
      const key = `${normalizeAddress(c.address)}|${normalizeAddress(c.city)}|${(c.state || "").toUpperCase()}`;
      lookup.set(key, c.id);
    }

    // Update each matched row
    for (const row of chunk) {
      processed++;
      const key = `${normalizeAddress(row.address)}|${normalizeAddress(row.city)}|${row.state}`;
      const propId = lookup.get(key);
      if (!propId) {
        unmatched++;
        unmatchedRows.push(row);
        continue;
      }
      matched++;

      // Build update payload — skip null/undefined fields so we don't blank existing data
      const update: Record<string, unknown> = {
        enrichment_source: sourceTag,
        enriched_at: new Date().toISOString(),
      };
      if (row.beds !== null && row.beds !== undefined) update.beds = row.beds;
      if (row.baths !== null && row.baths !== undefined) update.baths = row.baths;
      if (row.sqft !== null && row.sqft !== undefined) update.sqft = row.sqft;
      if (row.year_built !== null && row.year_built !== undefined) update.year_built = row.year_built;
      if (row.lot_size_sqft !== null && row.lot_size_sqft !== undefined) update.lot_size_sqft = row.lot_size_sqft;

      const { error: updErr } = await admin.from("properties").update(update).eq("id", propId);
      if (!updErr) updated++;
    }

    // Progress update every chunk
    await admin
      .from("property_enrichment_jobs")
      .update({
        processed_rows: processed,
        matched_rows: matched,
        updated_rows: updated,
        unmatched_rows: unmatched,
      })
      .eq("id", jobId);
  }

  // Persist unmatched CSV if any
  let unmatchedCsvUrl: string | null = null;
  if (unmatchedRows.length > 0) {
    const header = "address,city,state,zip,beds,baths,sqft,year_built,lot_size_sqft\n";
    const csvBody = unmatchedRows
      .map(
        (r) =>
          `"${r.address}","${r.city}","${r.state}","${r.zip ?? ""}",${r.beds ?? ""},${r.baths ?? ""},${r.sqft ?? ""},${r.year_built ?? ""},${r.lot_size_sqft ?? ""}`
      )
      .join("\n");
    const fileName = `unmatched-${jobId}.csv`;
    const { error: uploadErr } = await admin.storage
      .from("enrichment-unmatched")
      .upload(fileName, header + csvBody, {
        contentType: "text/csv",
        upsert: true,
      });
    if (!uploadErr) {
      const { data } = admin.storage.from("enrichment-unmatched").getPublicUrl(fileName);
      unmatchedCsvUrl = data.publicUrl;
    } else {
      console.error("[bulk-enrich] storage upload failed:", uploadErr);
    }
  }

  await admin
    .from("property_enrichment_jobs")
    .update({
      status: "completed",
      processed_rows: processed,
      matched_rows: matched,
      updated_rows: updated,
      unmatched_rows: unmatched,
      unmatched_csv_url: unmatchedCsvUrl,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return new Response(
    JSON.stringify({
      ok: true,
      jobId,
      total: rows.length,
      matched,
      updated,
      unmatched,
      unmatched_csv_url: unmatchedCsvUrl,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
