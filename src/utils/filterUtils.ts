/**
 * Reusable filter utility functions for consistent filter handling across the application
 */

import type { LeadFilters } from "@/schemas";

/**
 * Clean filter object by removing undefined/null/empty values
 */
export function cleanFilters(filters: unknown): LeadFilters {
  if (!filters || typeof filters !== 'object') {
    return {};
  }
  
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    // Skip undefined, null, empty strings, and empty arrays
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    
    // Special handling for boolean values - include false values
    if (typeof value === 'boolean') {
      cleaned[key] = value;
      continue;
    }
    
    // Special handling for snapScoreRange - must be valid tuple
    if (key === 'snapScoreRange' && Array.isArray(value)) {
      const [min, max] = value as [unknown, unknown];
      if (typeof min === 'number' && typeof max === 'number' && min <= max && min >= 0 && max <= 100) {
        cleaned[key] = [min, max];
      }
      continue;
    }
    
    cleaned[key] = value;
  }
  
  return cleaned as LeadFilters;
}

/**
 * Count active filters (excluding sortBy)
 */
export function countActiveFilters(filters: LeadFilters): number {
  let count = 0;
  
  if (filters.search?.trim()) count++;
  if (filters.cities?.length) count++;
  if (filters.state) count++;
  if (filters.county) count++;
  if (filters.jurisdictionId) count++;
  if (filters.snapScoreRange) count++;
  if (filters.lastSeenDays !== undefined && filters.lastSeenDays !== null && filters.lastSeenDays > 0) count++;
  if (filters.violationType) count++;
  if (filters.openViolationsOnly === true) count++;
  if (filters.multipleViolationsOnly === true) count++;
  if (filters.repeatOffenderOnly === true) count++;
  if (filters.listId) count++;
  
  return count;
}

/**
 * Check if filters are empty (no active filters)
 */
export function isEmptyFilters(filters: LeadFilters): boolean {
  return countActiveFilters(filters) === 0;
}

/**
 * Create a default empty filter object
 */
export function createEmptyFilters(): LeadFilters {
  return {
    sortBy: 'snap_score', // Default sort
  };
}

/**
 * Merge filters with defaults
 */
export function mergeFiltersWithDefaults(filters: Partial<LeadFilters>): LeadFilters {
  return {
    ...createEmptyFilters(),
    ...cleanFilters(filters),
  };
}

/**
 * Validate filter values
 */
export function validateFilters(filters: LeadFilters): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate snapScoreRange
  if (filters.snapScoreRange) {
    const [min, max] = filters.snapScoreRange;
    if (typeof min !== 'number' || typeof max !== 'number') {
      errors.push('snapScoreRange must be a tuple of numbers');
    } else if (min < 0 || max > 100) {
      errors.push('snapScoreRange values must be between 0 and 100');
    } else if (min > max) {
      errors.push('snapScoreRange min must be less than or equal to max');
    }
  }
  
  // Validate lastSeenDays
  if (filters.lastSeenDays !== undefined && filters.lastSeenDays !== null) {
    if (typeof filters.lastSeenDays !== 'number' || filters.lastSeenDays < 0) {
      errors.push('lastSeenDays must be a non-negative number');
    }
  }
  
  // Validate cities array
  if (filters.cities && !Array.isArray(filters.cities)) {
    errors.push('cities must be an array');
  }
  
  // Validate sortBy
  if (filters.sortBy && !['snap_score', 'newest_violation', 'recently_updated'].includes(filters.sortBy)) {
    errors.push('sortBy must be one of: snap_score, newest_violation, recently_updated');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create filter object from individual filter values (for Leads page)
 */
export function buildFiltersFromState(params: {
  searchQuery?: string;
  selectedCity?: string | null;
  selectedState?: string | null;
  lastSeenDays?: number | null;
  selectedSignal?: string | null;
  openViolationsOnly?: boolean;
  multipleViolationsOnly?: boolean;
  repeatOffenderOnly?: boolean;
  sortBy?: string;
  snapScoreRange?: [number, number] | null;
}): LeadFilters {
  const filters: Record<string, unknown> = {};
  
  // Search
  if (params.searchQuery?.trim()) {
    filters.search = params.searchQuery.trim();
  }
  
  // Location
  if (params.selectedCity) {
    filters.cities = [params.selectedCity];
  }
  if (params.selectedState) {
    filters.state = params.selectedState;
  }
  
  // Time filter
  if (params.lastSeenDays !== null && params.lastSeenDays !== undefined && params.lastSeenDays > 0) {
    filters.lastSeenDays = params.lastSeenDays;
  }
  
  // Violation type
  if (params.selectedSignal) {
    filters.violationType = params.selectedSignal;
  }
  
  // Pressure level filters
  if (params.openViolationsOnly === true) {
    filters.openViolationsOnly = true;
  }
  if (params.multipleViolationsOnly === true) {
    filters.multipleViolationsOnly = true;
  }
  if (params.repeatOffenderOnly === true) {
    filters.repeatOffenderOnly = true;
  }
  
  // Score range
  if (params.snapScoreRange) {
    filters.snapScoreRange = params.snapScoreRange;
  }
  
  // Sorting - always include
  filters.sortBy = (params.sortBy as 'snap_score' | 'newest_violation' | 'recently_updated') || 'snap_score';
  
  return cleanFilters(filters) as LeadFilters;
}

/**
 * Log filters for debugging (only in dev mode)
 */
export function logFilters(context: string, filters: LeadFilters): void {
  if (import.meta.env.DEV) {
    console.log(`[${context}] Filters:`, JSON.stringify(filters, null, 2));
    console.log(`[${context}] Active filter count:`, countActiveFilters(filters));
  }
}
