/**
 * Normalizes an address string to Title Case with proper handling for:
 * - Directional abbreviations (N, S, E, W, NE, NW, SE, SW)
 * - Street type abbreviations (ST, AVE, BLVD, DR, RD, LN, CT, PL, CIR, etc.)
 * - Unit indicators (APT, STE, UNIT, #)
 * - Ordinal numbers (1ST, 2ND, 3RD, 4TH, etc.)
 */

const UPPERCASE_WORDS = new Set([
  // Directionals
  'N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW',
  // State abbreviations (in case they appear)
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
  // Unit identifiers
  'PO', 'BOX',
]);

const STREET_SUFFIXES = new Set([
  'ST', 'AVE', 'BLVD', 'DR', 'RD', 'LN', 'CT', 'PL', 'CIR', 'WAY', 'TER', 'TERR', 'PKY', 'PKWY', 'HWY', 'FWY', 'EXPY', 'SQ', 'LOOP', 'TRL', 'PATH', 'RUN', 'PASS', 'XING', 'ALY', 'ROW',
]);

const UNIT_TYPES = new Set([
  'APT', 'STE', 'UNIT', 'FL', 'BLDG', 'RM', 'LOT', 'REAR', 'FRONT', 'BSMT', 'LBBY',
]);

export function formatAddress(address: string | null): string {
  if (!address) return '';
  
  return address
    .toLowerCase()
    .split(/(\s+|,)/) // Split by whitespace or comma, keeping separators
    .map(word => {
      // Skip empty strings and separators
      if (!word.trim() || word === ',') return word;
      
      const upper = word.toUpperCase();
      
      // Keep directionals, state abbrevs, etc. uppercase
      if (UPPERCASE_WORDS.has(upper)) {
        return upper;
      }
      
      // Keep street suffixes uppercase
      if (STREET_SUFFIXES.has(upper)) {
        return upper;
      }
      
      // Keep unit types uppercase
      if (UNIT_TYPES.has(upper)) {
        return upper;
      }
      
      // Handle ordinals (1st, 2nd, 3rd, 4th, etc.) - keep suffix lowercase
      if (/^\d+(st|nd|rd|th)$/i.test(word)) {
        return word.toLowerCase();
      }
      
      // Handle hash/pound for unit numbers
      if (word.startsWith('#')) {
        return word;
      }
      
      // Title case everything else
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

/**
 * Formats city name to Title Case
 */
export function formatCity(city: string | null): string {
  if (!city) return '';
  
  return city
    .toLowerCase()
    .split(/(\s+|-|')/) // Handle spaces, hyphens, and apostrophes
    .map(word => {
      if (!word.trim() || word === '-' || word === '\'') return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}
