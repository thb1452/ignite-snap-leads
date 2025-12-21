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
 * Returns a map of "city|state" -> CSV string, and count of skipped rows
 * IMPORTANT: Preserves original CSV lines exactly to avoid parsing issues
 *
 * Fixed: Now properly maps parsed row indices to original line indices
 * to handle skipEmptyLines and other parsing edge cases.
 */
export function splitCsvByCity(
  csvText: string,
  fallbackCity?: string,
  fallbackState?: string
): { csvGroups: Map<string, string>; skippedRows: number } {
  // Split into lines, preserving the original header
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    console.log('[splitCsvByCity] CSV has no data rows');
    return { csvGroups: new Map(), skippedRows: 0 };
  }
  
  const headerLine = lines[0];
  const dataLines = lines.slice(1);
  
  // Parse headers to find city/state column indices
  const headerResult = Papa.parse<string[]>(headerLine, { header: false });
  const headers = (headerResult.data[0] || []).map(h => h.trim().toLowerCase());
  const cityColIndex = headers.findIndex(h => h === 'city');
  const stateColIndex = headers.findIndex(h => h === 'state');
  
  console.log('[splitCsvByCity] Total lines:', lines.length, 'Data lines:', dataLines.length);
  console.log('[splitCsvByCity] City column index:', cityColIndex, 'State column index:', stateColIndex);
  
  // Group original LINE INDICES by city|state
  // This avoids the mismatch between parsed rows (with skipEmptyLines) and original lines
  const cityLineIndices = new Map<string, number[]>();
  let skippedRowCount = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    
    // Skip truly empty lines
    if (!line || line.trim() === '') continue;
    
    // Parse this single line to extract city/state values
    const rowResult = Papa.parse<string[]>(line, { header: false });
    const values = rowResult.data[0] || [];
    
    let city = (cityColIndex >= 0 && values[cityColIndex]) ? values[cityColIndex].trim() : '';
    let state = (stateColIndex >= 0 && values[stateColIndex]) ? values[stateColIndex].trim().toUpperCase() : '';

    // Apply fallbacks if missing
    if (!city && fallbackCity) city = fallbackCity;
    if (!state && fallbackState) state = fallbackState;

    // Skip rows without location (no fallback provided)
    if (!city || !state) {
      console.log(`[splitCsvByCity] Skipping line ${i + 2}: no city/state - city="${city}" state="${state}"`);
      skippedRowCount++;
      continue;
    }

    const key = `${city}|${state}`;
    const indices = cityLineIndices.get(key) || [];
    indices.push(i); // Store original line index
    cityLineIndices.set(key, indices);
  }

  console.log('[splitCsvByCity] City groups:', Array.from(cityLineIndices.entries()).map(([k, v]) => `${k}: ${v.length} rows`));
  console.log(`[splitCsvByCity] Skipped ${skippedRowCount} rows due to missing city/state`);

  // Build CSV strings using ORIGINAL lines
  const csvGroups = new Map<string, string>();
  for (const [key, indices] of cityLineIndices) {
    if (indices.length === 0) {
      console.log(`[splitCsvByCity] Skipping group ${key}: no rows`);
      continue;
    }
    
    const groupLines = [headerLine];
    for (const idx of indices) {
      const line = dataLines[idx];
      if (line && line.trim() !== '') {
        groupLines.push(line);
      }
    }
    
    // Only create group if we have actual data rows
    if (groupLines.length > 1) {
      const csv = groupLines.join('\n');
      console.log(`[splitCsvByCity] Group ${key}: ${groupLines.length - 1} data lines, CSV length: ${csv.length}`);
      csvGroups.set(key, csv);
    } else {
      console.log(`[splitCsvByCity] Skipping group ${key}: only header, no data`);
    }
  }

  return { csvGroups, skippedRows: skippedRowCount };
}
