import { supabase } from "@/integrations/supabase/externalClient";
import { shouldLogListEnrichmentY } from "@/utils/listEnrichmentDebug";

/** Treat SnapScore at or above this as “high” for upsell matching. */
const HIGH_SNAP_SCORE_MIN = 55;

/**
 * Max 5-digit zips per query when using `.or(zip.eq…,zip.like…-ZIP+4)` (keeps URL size safe).
 */
const ZIP_OR_CHUNK_SIZE = 28;

/** Max rows fetched per zip-chunk for address exclusion pass. */
const FETCH_CAP_PER_ZIP_CHUNK = 15_000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Match `properties.zip` stored as 5-digit or ZIP+4 (`12345-6789`). */
function buildZipOrClause(zips: string[]): string {
  return zips.flatMap((z) => [`zip.eq.${z}`, `zip.like.${z}-%`]).join(",");
}

export function normalizeAddressForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
}

/**
 * Normalize CSV / DB zip to a 5-digit string for comparison with `properties.zip` (text).
 * Handles ZIP+4 (first 5 digits), quoted strings, and numeric-looking values.
 */
export function normalizeZip(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return null;
}

/** Parse entire CSV into rows (header + data); handles quoted fields like preview parser. */
export function parseFullCsvRows(text: string): string[][] {
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
      if (current.trim() || lines.length > 0) lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length === 0) return [];

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

  return lines.map(parseLine);
}

/**
 * Count properties in the given zips with high SnapScore, excluding normalized addresses from the upload.
 * Uses chunked `.in("zip", …)` queries and logs diagnostic steps when `import.meta.env.DEV` is true.
 */
export async function countAdditionalHighSnapInZips(
  zipsRaw: (string | number)[],
  uploadedAddressesNormalized: Set<string>,
): Promise<number> {
  const normalized = zipsRaw.map((z) => normalizeZip(z)).filter((z): z is string => z != null);
  const uniqueZips = [...new Set(normalized)];

  if (uniqueZips.length === 0) {
    if (shouldLogListEnrichmentY()) {
      console.log("[ListEnrichment][Y] No valid 5-digit zips after normalize", {
        rawSample: zipsRaw.slice(0, 10),
      });
    }
    return 0;
  }

  if (shouldLogListEnrichmentY()) {
    console.log("[ListEnrichment][Y] Zip parse: unique count =", uniqueZips.length, {
      sample: uniqueZips.slice(0, 30),
      note: "Compared as 5-char strings to properties.zip (text)",
    });
  }

  // --- Baseline: any row in these zips (confirms zips match DB + RLS allows read) ---
  let baselineTotal = 0;
  for (const zchunk of chunk(uniqueZips, ZIP_OR_CHUNK_SIZE)) {
    const { count, error } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .or(buildZipOrClause(zchunk));

    if (error) {
      console.error("[ListEnrichment][Y] Baseline count query failed", error);
      return 0;
    }
    baselineTotal += count ?? 0;
  }
  if (shouldLogListEnrichmentY()) {
    console.log("[ListEnrichment][Y] Baseline: property rows in zips (no snap_score, full list):", baselineTotal);
  }

  // --- Optional: if baseline is zero, probe first normalized zip (eq + ZIP+4 pattern) ---
  if (shouldLogListEnrichmentY() && baselineTotal === 0 && uniqueZips[0]) {
    const probeZip = uniqueZips[0];
    const { data: probe, error: probeErr } = await supabase
      .from("properties")
      .select("zip, snap_score, address")
      .or(`zip.eq.${probeZip},zip.like.${probeZip}-%`)
      .limit(5);
    console.log("[ListEnrichment][Y] Probe first zip (eq or ZIP+4)", probeZip, { probe, probeErr });
  }

  if (baselineTotal === 0) {
    if (shouldLogListEnrichmentY()) {
      console.log("[ListEnrichment][Y] Final Y = 0 (no properties in these zips)");
      console.log("[ListEnrichment][Y] Summary", {
        uniqueZipCount: uniqueZips.length,
        zipSample: uniqueZips.slice(0, 8),
        baselineInZips: 0,
        highSnapInZips: 0,
        snapScoreMin: HIGH_SNAP_SCORE_MIN,
        additionalNotOnCsv: 0,
        hint: "No rows in properties match these zips (after normalize). Upsell stays hidden when Y = 0.",
      });
    }
    return 0;
  }

  // --- With snap_score filter (head count only, chunked) ---
  let snapFilteredTotal = 0;
  for (const zchunk of chunk(uniqueZips, ZIP_OR_CHUNK_SIZE)) {
    const { count, error } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .or(buildZipOrClause(zchunk))
      .gte("snap_score", HIGH_SNAP_SCORE_MIN);

    if (error) {
      console.error("[ListEnrichment][Y] Snap-filter count query failed", error);
      return 0;
    }
    snapFilteredTotal += count ?? 0;
  }
  if (shouldLogListEnrichmentY()) {
    console.log(
      "[ListEnrichment][Y] With snap_score >=",
      HIGH_SNAP_SCORE_MIN,
      "count:",
      snapFilteredTotal,
    );
  }

  // --- Final Y: same filters + exclude CSV addresses (fetch per zip-chunk) ---
  let y = 0;
  for (const zchunk of chunk(uniqueZips, ZIP_OR_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("properties")
      .select("address")
      .or(buildZipOrClause(zchunk))
      .gte("snap_score", HIGH_SNAP_SCORE_MIN)
      .order("snap_score", { ascending: false })
      .limit(FETCH_CAP_PER_ZIP_CHUNK);

    if (error) {
      console.error("[ListEnrichment][Y] Address-exclusion fetch failed", error);
      continue;
    }
    for (const row of data ?? []) {
      const key = normalizeAddressForMatch(row.address ?? "");
      if (!key || uploadedAddressesNormalized.has(key)) continue;
      y++;
    }
  }

  if (shouldLogListEnrichmentY()) {
    console.log("[ListEnrichment][Y] Final Y (high SnapScore, not on CSV):", y);
    console.log("[ListEnrichment][Y] Summary", {
      uniqueZipCount: uniqueZips.length,
      zipSample: uniqueZips.slice(0, 8),
      baselineInZips: baselineTotal,
      highSnapInZips: snapFilteredTotal,
      snapScoreMin: HIGH_SNAP_SCORE_MIN,
      additionalNotOnCsv: y,
    });
    if (snapFilteredTotal > 0 && y === 0) {
      console.log(
        "[ListEnrichment][Y] Snap-filter count > 0 but Y = 0 — likely all high-SnapScore rows match CSV addresses after normalization.",
      );
    }
  }

  return y;
}