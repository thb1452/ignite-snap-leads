import Papa from "papaparse";
import type { CsvDetectionResult, DetectedLocation } from "@/components/upload/CsvLocationDetector";

// Valid US state codes (2-letter abbreviations)
const VALID_US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

// Known cities for smart extraction from address fields
const KNOWN_CITIES_CA = [
  'Anaheim', 'Santa Ana', 'Orange', 'Irvine', 'Huntington Beach',
  'Costa Mesa', 'Fullerton', 'Garden Grove', 'Tustin', 'Westminster',
  'Newport Beach', 'Buena Park', 'Lake Forest', 'San Clemente',
  'Mission Viejo', 'Yorba Linda', 'San Juan Capistrano', 'Laguna Niguel',
  'La Habra', 'Fountain Valley', 'Placentia', 'Rancho Santa Margarita',
  'Aliso Viejo', 'Laguna Beach', 'Stanton', 'Cypress', 'Dana Point',
  'Laguna Hills', 'Seal Beach', 'Brea', 'La Palma', 'Los Alamitos',
  'Villa Park', 'Midway City', 'Silverado', 'Trabuco Canyon', 'Ladera Ranch',
  'Coto De Caza', 'Las Flores', 'Rancho Mission Viejo', 'Rossmoor',
  'Los Angeles', 'San Diego', 'San Francisco', 'San Jose', 'Oakland',
  'Long Beach', 'Sacramento', 'Fresno', 'Bakersfield', 'Riverside',
  'El Toro'
];

const KNOWN_CITIES_NV = [
  'Carson City', 'Reno', 'Sparks', 'Henderson', 'Las Vegas', 'North Las Vegas',
  'Elko', 'Boulder City', 'Mesquite', 'Fallon', 'Fernley', 'Winnemucca',
  'Pahrump', 'Incline Village', 'Minden', 'Gardnerville', 'Dayton', 'Yerington'
];

const ALL_KNOWN_CITIES = [...KNOWN_CITIES_CA, ...KNOWN_CITIES_NV];

/**
 * Extract city from address field if city column is empty or contains a zip code
 */
function extractCityFromAddress(address: string, cityField: string): string {
  const trimmedCity = cityField?.trim() || '';
  const addressTrimmed = address.trim();
  
  // Check if city field needs extraction (empty or contains a zip code)
  const needsExtraction = !trimmedCity || /^\d{5}(-\d{4})?$/.test(trimmedCity);
  
  if (!needsExtraction) {
    return trimmedCity;
  }
  
  // Try to find known city at end of address (sorted by length to match longer names first)
  const sortedCities = [...ALL_KNOWN_CITIES].sort((a, b) => b.length - a.length);
  
  for (const city of sortedCities) {
    // Match city at end of address, with optional comma/space before
    const cityPattern = new RegExp(`[,\\s]+${city.replace(/\s+/g, '\\s+')}\\s*$`, 'i');
    
    if (cityPattern.test(addressTrimmed)) {
      console.log(`[extractCityFromAddress] Extracted "${city}" from address "${addressTrimmed.substring(0, 40)}..."`);
      return city;
    }
  }
  
  // Fallback: try to extract last word(s) as potential city
  const parts = addressTrimmed.split(/\s+/);
  
  if (parts.length >= 2) {
    // Try last 2 words first (for cities like "Santa Ana", "Los Alamitos")
    const last2Words = parts.slice(-2).join(' ');
    if (/^[A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+$/.test(last2Words)) {
      console.log(`[extractCityFromAddress] Inferred 2-word city "${last2Words}" from address`);
      return last2Words;
    }
    
    // Try last 1 word (for cities like "Anaheim", "Orange", "Tustin")
    const lastWord = parts[parts.length - 1];
    if (/^[A-Z][a-zA-Z]+$/.test(lastWord) && lastWord.length >= 4) {
      console.log(`[extractCityFromAddress] Inferred 1-word city "${lastWord}" from address`);
      return lastWord;
    }
  }
  
  return trimmedCity;
}

/**
 * Validate that a string looks like a real city name, not a violation description
 * Returns true if the value appears to be a valid city name
 */
function isValidCityName(value: string): boolean {
  if (!value || value.length === 0) return false;

  // Reject if it's too long (cities are rarely over 50 chars)
  if (value.length > 50) return false;

  // Reject if it contains multiple sentences (periods followed by space/capital letter)
  if (/\.\s+[A-Z]/.test(value)) return false;

  // Reject if it contains violation-like keywords
  const violationKeywords = [
    'violation', 'debris', 'trash', 'weeds', 'overgrown', 'illegal',
    'unpermitted', 'code', 'notice', 'complaint', 'hazard', 'unsafe',
    'repair', 'maintain', 'fence', 'yard', 'property', 'building',
    'structure', 'obstruct', 'block', 'parked', 'stored', 'dumped',
    'please', 'must', 'should', 'shall', 'required', 'notify',
    'backyard', 'front', 'side', 'rear', 'porch', 'roof', 'window',
    'vehicle', 'junk', 'abandoned', 'grass', 'tall', 'high', 'fire',
    'permit', 'inspection', 'inspector', 'citation', 'fine', 'warning',
    'hurricane', 'storm', 'flood', 'damage', 'broken', 'missing'
  ];

  const lowerValue = value.toLowerCase();
  for (const keyword of violationKeywords) {
    if (lowerValue.includes(keyword)) return false;
  }

  // Reject if it contains common violation punctuation patterns
  if (value.includes(':') || value.includes(';')) return false;
  if (value.includes('(') || value.includes(')')) return false;
  if (value.includes('[') || value.includes(']')) return false;

  // Reject if it starts with numbers or special chars (like "1.", "2-3", etc.)
  if (/^[\d\-#]/.test(value)) return false;

  // City names should primarily contain letters, spaces, hyphens, and apostrophes
  if (!/^[A-Za-z\s\-'.]+$/.test(value)) return false;

  return true;
}

/**
 * Validate that a string is a valid 2-letter US state code
 */
function isValidStateCode(value: string): boolean {
  if (!value || value.length === 0) return false;
  const upperValue = value.trim().toUpperCase();
  return VALID_US_STATES.has(upperValue);
}

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
    const rawCity = (row.city || "").trim();
    const address = (row.address || row.location || row.property_address || "").trim();
    const state = (row.state || "").trim().toUpperCase();
    
    // Try to extract city from address if city column is empty or contains a zip code
    const city = extractCityFromAddress(address, rawCity);

    // Validate city and state - reject if they look like violation descriptions
    if (!city || !state || !isValidCityName(city) || !isValidStateCode(state)) {
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
  
  // Parse headers to find city/state/address column indices
  const headerResult = Papa.parse<string[]>(headerLine, { header: false });
  const headers = (headerResult.data[0] || []).map(h => h.trim().toLowerCase());
  const cityColIndex = headers.findIndex(h => h === 'city');
  const stateColIndex = headers.findIndex(h => h === 'state');
  const addressColIndex = headers.findIndex(h => h === 'address' || h === 'location' || h === 'property_address');
  
  console.log('[splitCsvByCity] Total lines:', lines.length, 'Data lines:', dataLines.length);
  console.log('[splitCsvByCity] City column index:', cityColIndex, 'State column index:', stateColIndex, 'Address column index:', addressColIndex);
  
  // Group original LINE INDICES by city|state
  // This avoids the mismatch between parsed rows (with skipEmptyLines) and original lines
  const cityLineIndices = new Map<string, number[]>();
  let skippedRowCount = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    
    // Skip truly empty lines
    if (!line || line.trim() === '') continue;
    
    // Parse this single line to extract city/state/address values
    const rowResult = Papa.parse<string[]>(line, { header: false });
    const values = rowResult.data[0] || [];
    
    const rawCity = (cityColIndex >= 0 && values[cityColIndex]) ? values[cityColIndex].trim() : '';
    const address = (addressColIndex >= 0 && values[addressColIndex]) ? values[addressColIndex].trim() : '';
    let state = (stateColIndex >= 0 && values[stateColIndex]) ? values[stateColIndex].trim().toUpperCase() : '';
    
    // Try to extract city from address if city column is empty or contains a zip code
    let city = extractCityFromAddress(address, rawCity);

    // Validate city/state - reject if they look like violation descriptions
    const cityLooksValid = city && isValidCityName(city);
    const stateLooksValid = state && isValidStateCode(state);

    // Apply fallbacks if missing OR invalid
    if (!cityLooksValid && fallbackCity) city = fallbackCity;
    if (!stateLooksValid && fallbackState) state = fallbackState;

    // Re-validate after applying fallbacks
    const finalCityValid = city && isValidCityName(city);
    const finalStateValid = state && isValidStateCode(state);

    // Skip rows without valid location data
    if (!finalCityValid || !finalStateValid) {
      console.log(`[splitCsvByCity] Skipping line ${i + 2}: invalid/missing city/state - city="${city}" (valid=${finalCityValid}) state="${state}" (valid=${finalStateValid})`);
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
