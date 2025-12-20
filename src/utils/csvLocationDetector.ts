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
 * IMPORTANT: Preserves original headers and row data exactly
 */
export function splitCsvByCity(csvText: string, fallbackCity?: string, fallbackState?: string): Map<string, string> {
  // First parse to get the original header line
  const lines = csvText.trim().split('\n');
  const headerLine = lines[0];
  
  // Parse with normalized headers for location detection
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const rows = result.data;
  const cityGroups = new Map<string, number[]>(); // Store indices of rows for each city

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
    const indices = cityGroups.get(key) || [];
    indices.push(i);
    cityGroups.set(key, indices);
  }

  // Convert groups back to CSV strings using original lines
  const csvGroups = new Map<string, string>();
  const dataLines = lines.slice(1); // All lines after header
  
  for (const [key, rowIndices] of cityGroups) {
    // Build CSV with original header + selected rows
    const groupLines = [headerLine];
    for (const idx of rowIndices) {
      if (dataLines[idx]) {
        groupLines.push(dataLines[idx]);
      }
    }
    csvGroups.set(key, groupLines.join('\n'));
  }

  return csvGroups;
}
