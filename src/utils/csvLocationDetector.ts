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
 * Returns a map of "city|state" -> rows
 */
export function splitCsvByCity(csvText: string, fallbackCity?: string, fallbackState?: string): Map<string, string> {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const rows = result.data;
  const headers = result.meta.fields || [];
  const cityGroups = new Map<string, Record<string, string>[]>();

  for (const row of rows) {
    let city = (row.city || "").trim();
    let state = (row.state || "").trim().toUpperCase();

    // Apply fallbacks if missing
    if (!city && fallbackCity) city = fallbackCity;
    if (!state && fallbackState) state = fallbackState;

    // Skip rows without location (no fallback provided)
    if (!city || !state) continue;

    const key = `${city}|${state}`;
    const group = cityGroups.get(key) || [];
    group.push(row);
    cityGroups.set(key, group);
  }

  // Convert groups back to CSV strings
  const csvGroups = new Map<string, string>();
  for (const [key, groupRows] of cityGroups) {
    const csv = Papa.unparse(groupRows, { columns: headers });
    csvGroups.set(key, csv);
  }

  return csvGroups;
}
