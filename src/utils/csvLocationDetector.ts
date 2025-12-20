import Papa from "papaparse";
import type { CsvDetectionResult, DetectedLocation } from "@/components/upload/CsvLocationDetector";

/**
 * Detect unique locations from CSV data
 * Returns summary of cities, states, and rows missing location data
 */
export function detectCsvLocations(csvText: string): CsvDetectionResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const rows = result.data;
  const locationCounts = new Map<string, { city: string; state: string; count: number }>();
  const uniqueStates = new Set<string>();
  const uniqueCities = new Set<string>();
  let missingLocationRows = 0;

  for (const row of rows) {
    const city = (row.city || "").trim();
    const state = (row.state || "").trim().toUpperCase();

    if (!city || !state) {
      missingLocationRows++;
      continue;
    }

    const key = `${city.toLowerCase()}|${state}`;
    const existing = locationCounts.get(key);
    
    if (existing) {
      existing.count++;
    } else {
      locationCounts.set(key, { city, state, count: 1 });
    }

    uniqueStates.add(state);
    uniqueCities.add(city);
  }

  // Convert to sorted array (highest count first)
  const locations: DetectedLocation[] = Array.from(locationCounts.values())
    .sort((a, b) => b.count - a.count);

  return {
    locations,
    missingLocationRows,
    totalRows: rows.length,
    uniqueStates: Array.from(uniqueStates).sort(),
    uniqueCities: Array.from(uniqueCities).sort(),
  };
}

/**
 * Split CSV rows by city for multi-job creation
 * Returns a map of "city|state" -> CSV string
 * IMPORTANT: Preserves original CSV lines exactly to avoid parsing issues
 */
export function splitCsvByCity(csvText: string, fallbackCity?: string, fallbackState?: string): Map<string, string> {
  // Split into lines, preserving the original header
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    console.log('[splitCsvByCity] CSV has no data rows');
    return new Map();
  }
  
  const headerLine = lines[0];
  const dataLines = lines.slice(1);
  
  // Parse to get normalized headers for city/state detection
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const rows = result.data;
  
  console.log('[splitCsvByCity] Total lines:', lines.length, 'Data rows:', dataLines.length, 'Parsed rows:', rows.length);
  
  // Group LINE INDICES by city|state (not parsed rows)
  const cityLineIndices = new Map<string, number[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let city = (row.city || "").trim();
    let state = (row.state || "").trim().toUpperCase();

    // Apply fallbacks if missing
    if (!city && fallbackCity) city = fallbackCity;
    if (!state && fallbackState) state = fallbackState;

    // Skip rows without location (no fallback provided)
    if (!city || !state) continue;

    const key = `${city}|${state}`;
    const indices = cityLineIndices.get(key) || [];
    indices.push(i);
    cityLineIndices.set(key, indices);
  }

  console.log('[splitCsvByCity] City groups:', Array.from(cityLineIndices.entries()).map(([k, v]) => `${k}: ${v.length} rows`));

  // Build CSV strings using ORIGINAL lines (not Papa.unparse)
  const csvGroups = new Map<string, string>();
  for (const [key, indices] of cityLineIndices) {
    const groupLines = [headerLine];
    for (const idx of indices) {
      // dataLines[idx] corresponds to rows[idx]
      if (dataLines[idx]) {
        groupLines.push(dataLines[idx]);
      }
    }
    const csv = groupLines.join('\n');
    console.log(`[splitCsvByCity] Group ${key}: ${groupLines.length - 1} data lines, CSV length: ${csv.length}`);
    csvGroups.set(key, csv);
  }

  return csvGroups;
}
