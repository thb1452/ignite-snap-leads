/**
 * Per-session random seed for deterministic per-user property ordering.
 * 
 * Each user session gets a unique seed so that:
 * - Same filters produce different ordering per user (fair lead distribution)
 * - Pagination remains consistent within a session
 * - Seed rotates on new login/session
 */

const SEED_KEY = 'snap_random_seed';

/** Generate a random hex string */
function generateSeed(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/** Get or create the session seed */
export function getRandomSeed(): string {
  try {
    let seed = sessionStorage.getItem(SEED_KEY);
    if (!seed) {
      seed = generateSeed();
      sessionStorage.setItem(SEED_KEY, seed);
      console.log('[randomSeed] New session seed generated');
    }
    return seed;
  } catch {
    // Fallback if sessionStorage unavailable (e.g. Safari private mode)
    return generateSeed();
  }
}

/** Force a new seed (e.g. on login) */
export function rotateRandomSeed(): string {
  const seed = generateSeed();
  try {
    sessionStorage.setItem(SEED_KEY, seed);
    console.log('[randomSeed] Seed rotated');
  } catch {
    // ignore
  }
  return seed;
}
