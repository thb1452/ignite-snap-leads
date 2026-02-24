// Deduplication logic for FOIA target imports

/**
 * Normalize a URL for consistent hashing:
 * - Lowercase
 * - Trim whitespace
 * - Remove trailing slash
 */
export function normalizeUrl(url: string): string {
  return url.toLowerCase().trim().replace(/\/$/, '');
}

/**
 * Simple but fast non-crypto hash for URL deduplication.
 * Uses FNV-1a 32-bit algorithm which is deterministic and collision-resistant
 * enough for dedup purposes.
 */
export function hashUrl(url: string): string {
  const normalized = normalizeUrl(url);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // unsigned 32-bit multiply
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Check if a URL hash already exists in the provided set.
 * Used during batch import to detect duplicates in-memory before DB insert.
 */
export function isDuplicateInBatch(urlHash: string, seenHashes: Set<string>): boolean {
  if (seenHashes.has(urlHash)) return true;
  seenHashes.add(urlHash);
  return false;
}
