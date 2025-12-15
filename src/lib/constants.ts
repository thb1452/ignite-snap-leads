/**
 * Centralized constants for Snap
 * Phase 2 refactor: Eliminates magic numbers and ensures consistency
 */

// ============================================================================
// SNAP SCORE RANGES
// ============================================================================

export const SNAP_SCORE = {
  RANGES: {
    DISTRESSED: { MIN: 70, MAX: 100 },
    VALUE_ADD: { MIN: 40, MAX: 69 },
    WATCH: { MIN: 0, MAX: 39 },
  },
  LABELS: {
    DISTRESSED: 'Distressed',
    VALUE_ADD: 'Value-Add',
    WATCH: 'Watch',
  },
  DESCRIPTIONS: {
    DISTRESSED: 'High opportunity - severe violations, chronic neglect, or legal escalation',
    VALUE_ADD: 'Moderate opportunity - multiple issues, responsive owner possible',
    WATCH: 'Low opportunity - minor issues, owner likely maintaining property',
  },
} as const;

// ============================================================================
// VIOLATION STATUSES
// ============================================================================

export const VIOLATION_STATUS = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  PENDING: 'Pending',
  UNKNOWN: 'Unknown',
} as const;

// ============================================================================
// UPLOAD LIMITS
// ============================================================================

export const UPLOAD_LIMITS = {
  MAX_ROWS: 50000,
  MAX_FILE_SIZE_MB: 50,
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
} as const;

// ============================================================================
// BATCH SIZES
// ============================================================================

export const BATCH_SIZES = {
  STAGING_INSERT: 1000,
  PROPERTY_INSERT: 500,
  VIOLATION_INSERT: 500,
  CSV_EXPORT: 1000,
  GEOCODING: 50,
  SKIPTRACE_CONCURRENCY: 20,
} as const;

// ============================================================================
// SUBSCRIPTION PLANS
// ============================================================================

export const SUBSCRIPTION_PLANS = {
  FREE_TRIAL: {
    ID: 'free-trial',
    NAME: 'Free Trial',
    PRICE: 0,
    CSV_EXPORTS_PER_MONTH: 3,
    SKIP_TRACE_CREDITS_PER_MONTH: 10,
  },
  STARTER: {
    ID: 'starter',
    NAME: 'Starter',
    PRICE: 39,
    CSV_EXPORTS_PER_MONTH: 10,
    SKIP_TRACE_CREDITS_PER_MONTH: 50,
  },
  PRO: {
    ID: 'pro',
    NAME: 'Pro',
    PRICE: 89,
    CSV_EXPORTS_PER_MONTH: -1, // Unlimited
    SKIP_TRACE_CREDITS_PER_MONTH: 200,
  },
  ELITE: {
    ID: 'elite',
    NAME: 'Elite',
    PRICE: 199,
    CSV_EXPORTS_PER_MONTH: -1, // Unlimited
    SKIP_TRACE_CREDITS_PER_MONTH: 500,
  },
} as const;

// ============================================================================
// SKIP TRACE
// ============================================================================

export const SKIP_TRACE = {
  MAX_ACTIVE_JOBS_PER_USER: 3,
  MAX_CONCURRENCY: 20,
  TIMEOUT_MS: 25000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 700,
} as const;

// ============================================================================
// API CONFIGURATION
// ============================================================================

export const API_CONFIG = {
  TIMEOUT_DEFAULT_MS: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
} as const;

// ============================================================================
// DEFAULT CREDITS
// ============================================================================

export const CREDITS = {
  NEW_USER_DEFAULT: 10,
} as const;

// ============================================================================
// LEAD ACTIVITY STATUSES
// ============================================================================

export const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  NEGOTIATING: 'negotiating',
  UNDER_CONTRACT: 'under_contract',
  CLOSED: 'closed',
  DEAD: 'dead',
} as const;

// ============================================================================
// MAP CONFIGURATION
// ============================================================================

export const MAP_CONFIG = {
  DEFAULT_CENTER: {
    LAT: 39.8283,
    LNG: -98.5795,
  },
  DEFAULT_ZOOM: 4,
  CLUSTER_MAX_ZOOM: 14,
  CLUSTER_RADIUS: 50,
} as const;

// ============================================================================
// PAGINATION
// ============================================================================

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
} as const;

// ============================================================================
// DATE FORMATS
// ============================================================================

export const DATE_FORMATS = {
  DISPLAY: 'MMM d, yyyy',
  DISPLAY_WITH_TIME: 'MMM d, yyyy h:mm a',
  ISO: 'yyyy-MM-dd',
} as const;

// ============================================================================
// VIOLATION TYPES
// ============================================================================

export const VIOLATION_TYPES = {
  STRUCTURAL: 'Structural',
  SAFETY: 'Safety',
  MAINTENANCE: 'Maintenance',
  HEALTH: 'Health',
  ZONING: 'Zoning',
  FIRE: 'Fire',
  ENVIRONMENTAL: 'Environmental',
  OTHER: 'Other',
} as const;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get SnapScore category from score value
 */
export function getSnapScoreCategory(score: number | null | undefined): keyof typeof SNAP_SCORE.LABELS {
  if (score == null) return 'WATCH';
  if (score >= SNAP_SCORE.RANGES.DISTRESSED.MIN) return 'DISTRESSED';
  if (score >= SNAP_SCORE.RANGES.VALUE_ADD.MIN) return 'VALUE_ADD';
  return 'WATCH';
}

/**
 * Get SnapScore label
 */
export function getSnapScoreLabel(score: number | null | undefined): string {
  const category = getSnapScoreCategory(score);
  return SNAP_SCORE.LABELS[category];
}

/**
 * Get SnapScore description
 */
export function getSnapScoreDescription(score: number | null | undefined): string {
  const category = getSnapScoreCategory(score);
  return SNAP_SCORE.DESCRIPTIONS[category];
}

/**
 * Check if value represents unlimited (-1)
 */
export function isUnlimited(value: number): boolean {
  return value === -1;
}

/**
 * Format usage limit for display
 */
export function formatUsageLimit(value: number): string {
  return isUnlimited(value) ? 'Unlimited' : value.toString();
}
