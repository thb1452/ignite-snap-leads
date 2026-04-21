import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers":
    "X-Enrichment-Total, X-Enrichment-Matched, X-Enrichment-Remaining, Content-Disposition",
  "Access-Control-Max-Age": "86400",
};

// Common street abbreviation expansions for normalization
const ABBREVIATIONS: Record<string, string> = {
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  dr: "drive",
  ln: "lane",
  rd: "road",
  ct: "court",
  cir: "circle",
  pl: "place",
  pkwy: "parkway",
  hwy: "highway",
  sq: "square",
  ter: "terrace",
  trl: "trail",
  way: "way",
  apt: "apartment",
  ste: "suite",
  fl: "floor",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
};

function normalizeAddress(addr: string): string {
  if (!addr) return "";
  let s = addr
    .toLowerCase()
    .trim()
    // Remove punctuation except hyphens in house numbers
    .replace(/[.,#]/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ");

  // Expand abbreviations (word boundary matching)
  s = s.replace(/\b([a-z]+)\.?\b/g, (match) => {
    const cleaned = match.replace(".", "");
    return ABBREVIATIONS[cleaned] || cleaned;
  });

  return s.trim();
}

function normalizeCity(city: string): string {
  if (!city) return "";
  return city.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeState(state: string): string {
  if (!state) return "";
  return state.toUpperCase().trim();
}

// Simple CSV parser that handles quoted fields
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim() || lines.length > 0) {
        lines.push(current);
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        fields.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows };
}

// Auto-detect which column is most likely the address column
function detectAddressColumn(headers: string[]): number {
  const addressKeywords = [
    "address",
    "street",
    "property_address",
    "property address",
    "street_address",
    "street address",
    "addr",
    "location",
    "site_address",
    "site address",
    "mailing_address",
    "mailing address",
  ];

  for (const keyword of addressKeywords) {
    const idx = headers.findIndex(
      (h) => h.toLowerCase().trim() === keyword
    );
    if (idx !== -1) return idx;
  }

  // Partial match
  for (const keyword of addressKeywords) {
    const idx = headers.findIndex((h) =>
      h.toLowerCase().trim().includes(keyword)
    );
    if (idx !== -1) return idx;
  }

  return -1; // Not found
}

// Escape CSV value for output
function escapeCSV(value: string): string {
  if (!value) return "";
  let safe = value;
  if (/^[=+\-@|\t]/.test(safe)) {
    safe = "\t" + safe;
  }
  if (safe.includes(",") || safe.includes("\n") || safe.includes('"')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

// Address column detection for city/state/zip
function detectCityColumn(headers: string[]): number {
  const keywords = ["city", "town", "municipality"];
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === kw);
    if (idx !== -1) return idx;
  }
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim().includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectStateColumn(headers: string[]): number {
  const keywords = ["state", "st", "province"];
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === kw);
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectZipColumn(headers: string[]): number {
  const keywords = ["zip", "zipcode", "zip_code", "zip code", "postal", "postal_code"];
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === kw);
    if (idx !== -1) return idx;
  }
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim().includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    // User-scoped client (respects RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Service role client for property lookups (bypasses RLS for read-only matching)
    const serviceClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
    );

    const {
      data: authData,
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = authData.user;

    // Parse multipart form data
    const contentType = req.headers.get("content-type") || "";

    let csvText: string;
    let fileName: string;
    let addressColumnIndex: number | undefined;
    let cityColumnIndex: number | undefined;
    let stateColumnIndex: number | undefined;
    let zipColumnIndex: number | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check file size (50MB limit)
      if (file.size > 50 * 1024 * 1024) {
        return new Response(
          JSON.stringify({
            error: "File too large",
            message: "Maximum file size is 50MB. Please upload a smaller file.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      fileName = file.name || "upload.csv";
      csvText = await file.text();

      // Optional column index overrides from form data
      const addrIdx = formData.get("addressColumnIndex");
      if (addrIdx !== null) addressColumnIndex = parseInt(addrIdx as string);
      const cityIdx = formData.get("cityColumnIndex");
      if (cityIdx !== null && cityIdx !== "") cityColumnIndex = parseInt(cityIdx as string);
      const stateIdx = formData.get("stateColumnIndex");
      if (stateIdx !== null && stateIdx !== "") stateColumnIndex = parseInt(stateIdx as string);
      const zipIdx = formData.get("zipColumnIndex");
      if (zipIdx !== null && zipIdx !== "") zipColumnIndex = parseInt(zipIdx as string);
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      csvText = body.csvText;
      fileName = body.fileName || "upload.csv";
      addressColumnIndex = body.addressColumnIndex;
      cityColumnIndex = body.cityColumnIndex;
      stateColumnIndex = body.stateColumnIndex;
      zipColumnIndex = body.zipColumnIndex;

      if (!csvText) {
        return new Response(
          JSON.stringify({ error: "No CSV data provided" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          error: "Unsupported content type. Use multipart/form-data or application/json.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse CSV
    const { headers, rows } = parseCSV(csvText);

    if (headers.length === 0 || rows.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid CSV",
          message: "The file appears to be empty or malformed.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Row count limit
    if (rows.length > 50000) {
      return new Response(
        JSON.stringify({
          error: "File too large",
          message: `This file contains ${rows.length} rows. Maximum is 50,000 rows. Please split the file and upload in smaller batches.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Detect or use provided column indices
    const addrCol =
      addressColumnIndex !== undefined && !isNaN(addressColumnIndex)
        ? addressColumnIndex
        : detectAddressColumn(headers);

    if (addrCol === -1 || addrCol >= headers.length) {
      return new Response(
        JSON.stringify({
          error: "Address column not found",
          message:
            "Could not detect an address column. Please specify the column index.",
          headers: headers,
          detectedIndex: -1,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cityCol = cityColumnIndex !== undefined && !isNaN(cityColumnIndex)
      ? cityColumnIndex
      : detectCityColumn(headers);
    const stateCol = stateColumnIndex !== undefined && !isNaN(stateColumnIndex)
      ? stateColumnIndex
      : detectStateColumn(headers);
    const zipCol = zipColumnIndex !== undefined && !isNaN(zipColumnIndex)
      ? zipColumnIndex
      : detectZipColumn(headers);

    console.log(
      `[enrich-list] Columns detected: address=${addrCol}, city=${cityCol}, state=${stateCol}, zip=${zipCol}`
    );
    console.log(`[enrich-list] Processing ${rows.length} rows for user ${user.id}`);

    // Check enrichment limits before processing
    const { data: limitCheck, error: limitError } = await supabase.rpc(
      "fn_check_enrichment_limit",
      {
        p_user_id: user.id,
        p_address_count: rows.length,
      }
    );

    if (limitError) {
      console.error("[enrich-list] Limit check error:", limitError);
      return new Response(
        JSON.stringify({
          error: "Unable to verify enrichment credits",
          message: "Please try again later.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (limitCheck && !limitCheck.allowed) {
      console.log("[enrich-list] Limit exceeded for user:", user.id, limitCheck);
      return new Response(
        JSON.stringify({
          error: "Enrichment limit exceeded",
          code: limitCheck.reason === "trial_limit_exceeded"
            ? "TRIAL_ENRICHMENT_LIMIT"
            : "ENRICHMENT_LIMIT_EXCEEDED",
          message: limitCheck.message,
          current: limitCheck.current,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining,
          is_trial: limitCheck.is_trial,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Process addresses in batches using DB function for case-insensitive matching
    const BATCH_SIZE = 200;
    let matchedCount = 0;
    const enrichedRows: Array<{
      originalRow: string[];
      activeViolation: string;
      violationType: string;
      snapScore: string;
      lastActivityDate: string;
      openCasesCount: string;
      aiBrief: string;
      actionLabel: string;
    }> = [];

    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

      // Build lowercase trimmed addresses for matching
      const batchAddresses = batch.map((row) => {
        const rawAddr = row[addrCol] || "";
        return rawAddr.toLowerCase().trim();
      });

      const uniqueAddresses = [
        ...new Set(batchAddresses.filter(Boolean)),
      ];

      if (uniqueAddresses.length === 0) {
        for (const row of batch) {
          enrichedRows.push({
            originalRow: row,
            activeViolation: "",
            violationType: "",
            snapScore: "",
            lastActivityDate: "",
            openCasesCount: "",
            aiBrief: "",
            actionLabel: "",
          });
        }
        continue;
      }

      // Use DB function for case-insensitive bulk match
      const { data: matchedProps, error: matchErr } = await serviceClient.rpc(
        "fn_bulk_match_properties",
        { p_addresses: uniqueAddresses }
      );

      if (matchErr) {
        console.error("[enrich-list] Bulk match error:", matchErr);
      }

      // Build lookup map: lowercase address -> property data
      const propsMap = new Map<string, {
        snap_score: number | null;
        open_violations: number | null;
        violation_types: string[] | null;
        last_enforcement_date: string | null;
        snap_insight: string | null;
      }>();

      if (matchedProps) {
        for (const p of matchedProps) {
          propsMap.set(p.input_address, {
            snap_score: p.snap_score,
            open_violations: p.open_violations,
            violation_types: p.violation_types,
            last_enforcement_date: p.last_enforcement_date,
            snap_insight: p.snap_insight ?? null,
          });
        }
      }

      // Match each row
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const lookupKey = batchAddresses[i];
        const match = lookupKey ? propsMap.get(lookupKey) : undefined;

        if (match) {
          matchedCount++;
          const hasOpenViolations = (match.open_violations || 0) > 0;
          // Extract action label from the end of snap_insight
          let aiBrief = "";
          let actionLabel = "";
          if (match.snap_insight) {
            const labelMatch = match.snap_insight.match(/\b(CALL NOW|HIGH OPPORTUNITY|GOOD OPPORTUNITY|WORTH A CALL|OPPORTUNITY|WATCH|MONITOR|LOW PRIORITY|WATCH\/PASS|PASS)\s*\.?\s*$/i);
            if (labelMatch) {
              const raw = labelMatch[1].toUpperCase().replace(/\.$/, "");
              // Normalize legacy labels
              if (raw === "CALL NOW" || raw === "HIGH OPPORTUNITY") actionLabel = "CALL NOW";
              else if (raw === "WORTH A CALL" || raw === "GOOD OPPORTUNITY") actionLabel = "WORTH A CALL";
              else if (raw === "OPPORTUNITY" || raw === "WATCH" || raw === "MONITOR" || raw === "LOW PRIORITY" || raw === "WATCH/PASS") actionLabel = "OPPORTUNITY";
              else if (raw === "PASS") actionLabel = "PASS";
              else actionLabel = raw;
              aiBrief = match.snap_insight.slice(0, labelMatch.index).trim();
            } else {
              aiBrief = match.snap_insight.trim();
            }
          }
          enrichedRows.push({
            originalRow: row,
            activeViolation: hasOpenViolations ? "Yes" : "No",
            violationType: (match.violation_types || []).join("; "),
            snapScore: match.snap_score?.toString() || "",
            lastActivityDate: match.last_enforcement_date || "",
            openCasesCount: (match.open_violations || 0).toString(),
            aiBrief,
            actionLabel,
          });
        } else {
          enrichedRows.push({
            originalRow: row,
            activeViolation: "",
            violationType: "",
            snapScore: "",
            lastActivityDate: "",
            openCasesCount: "",
            aiBrief: "",
            actionLabel: "",
          });
        }
      }

      console.log(
        `[enrich-list] Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: processed ${batch.length}, matched so far: ${matchedCount}`
      );
    }

    // Consume usage atomically
    const { data: usageResult, error: usageError } = await supabase.rpc(
      "fn_consume_enrichment_usage",
      {
        p_user_id: user.id,
        p_address_count: rows.length,
      }
    );

    if (usageError) {
      console.error("[enrich-list] Usage consumption error:", usageError);
      return new Response(
        JSON.stringify({
          error: "Usage tracking failed",
          message: "Please try again later.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (usageResult && !usageResult.allowed) {
      console.log("[enrich-list] Usage consumption denied:", usageResult);
      return new Response(
        JSON.stringify({
          error: "Enrichment limit exceeded",
          message: usageResult.message,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Log the enrichment job
    await supabase.from("enrichment_jobs").insert({
      user_id: user.id,
      file_name: fileName,
      status: "completed",
      total_rows: rows.length,
      processed_rows: rows.length,
      matched_rows: matchedCount,
      addresses_charged: rows.length,
      completed_at: new Date().toISOString(),
    });

    console.log(
      `[enrich-list] Complete: ${rows.length} rows, ${matchedCount} matched for user ${user.id}`
    );

    // Build enriched CSV
    const enrichmentHeaders = [
      "Active Violation",
      "Violation Type",
      "SnapScore",
      "Last Activity Date",
      "Open Cases Count",
      "AI Investor Brief",
      "Action Label",
    ];

    const csvOutputLines: string[] = [];
    // Header line: original headers + enrichment headers
    csvOutputLines.push(
      [...headers, ...enrichmentHeaders].map(escapeCSV).join(",")
    );

    for (const enriched of enrichedRows) {
      const line = [
        ...enriched.originalRow.map(escapeCSV),
        escapeCSV(enriched.activeViolation),
        escapeCSV(enriched.violationType),
        escapeCSV(enriched.snapScore),
        escapeCSV(enriched.lastActivityDate),
        escapeCSV(enriched.openCasesCount),
        escapeCSV(enriched.aiBrief),
        escapeCSV(enriched.actionLabel),
      ].join(",");
      csvOutputLines.push(line);
    }

    const csvOutput = csvOutputLines.join("\n");

    // Generate output filename
    const baseName = fileName.replace(/\.csv$/i, "");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const outputFileName = `enriched_${baseName}_${dateStr}.csv`;

    return new Response(csvOutput, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${outputFileName}"`,
        "X-Enrichment-Total": rows.length.toString(),
        "X-Enrichment-Matched": matchedCount.toString(),
        "X-Enrichment-Remaining": (usageResult?.remaining ?? "unlimited").toString(),
      },
    });
  } catch (error) {
    console.error("[enrich-list] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        message: "An unexpected error occurred. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
