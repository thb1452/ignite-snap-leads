/**
 * Sanitize filename for Supabase Storage compliance
 * Removes/replaces characters that cause "Invalid key" errors
 *
 * Common issues in municipal CSV filenames:
 * - Quotes: Code_Violations_"Final".csv
 * - Parens: Data_(Q3-Q4).csv
 * - Brackets: Report[2024].csv
 * - Spaces: Code Violations.csv
 *
 * @param filename - Original filename from user upload or city name
 * @returns Sanitized filename safe for Supabase Storage paths
 */
export function sanitizeFilename(filename: string): string {
  // Preserve file extension
  const lastDotIndex = filename.lastIndexOf('.');
  const name = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
  const ext = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

  const sanitized = name
    .replace(/["']/g, '')           // Remove quotes
    .replace(/[()[\]{}]/g, '')      // Remove brackets/parens
    .replace(/\s+/g, '_')           // Spaces → underscores
    .replace(/[<>:|?*]/g, '-')      // Invalid path chars → hyphens
    .replace(/\./g, '_')            // Replace remaining dots in name
    .replace(/_{2,}/g, '_')         // Collapse multiple underscores
    .replace(/^[._-]+|[._-]+$/g, ''); // Trim leading/trailing special chars

  return sanitized + ext;
}
