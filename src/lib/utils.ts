/**
 * Common utility functions
 * Phase 2 refactor: Extracts duplicate logic into reusable functions
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { VIOLATION_STATUS } from './constants';

// ============================================================================
// TAILWIND UTILITIES
// ============================================================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// CSV UTILITIES
// ============================================================================

/**
 * Escape CSV field value
 * Wraps in quotes and escapes internal quotes if needed
 */
export function escapeCSV(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value);

  // If value contains comma, newline, or quote, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================================================
// STATUS NORMALIZATION
// ============================================================================

/**
 * Normalize violation status to standard values
 */
export function normalizeStatus(status: string | null | undefined): string {
  if (!status) return VIOLATION_STATUS.UNKNOWN;

  const s = status.toLowerCase();

  if (s.includes('open') || s.includes('pending') || s.includes('active') ||
      s.includes('in progress') || s.includes('new')) {
    return VIOLATION_STATUS.OPEN;
  }

  if (s.includes('closed') || s.includes('resolved') || s.includes('complete') ||
      s.includes('complied') || s.includes('dismissed') || s.includes('abated')) {
    return VIOLATION_STATUS.CLOSED;
  }

  return VIOLATION_STATUS.UNKNOWN;
}

// ============================================================================
// PHONE UTILITIES
// ============================================================================

/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX)
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Strip non-digits
  const digits = phone.replace(/\D/g, '');

  // Handle 11-digit numbers starting with 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1${digits.slice(1)}`;
  }

  // Handle 10-digit numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Return with + prefix for other lengths
  return `+${digits}`;
}

/**
 * Format phone number for display (XXX) XXX-XXXX
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';

  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone;
}

// ============================================================================
// EMAIL UTILITIES
// ============================================================================

/**
 * Normalize email to lowercase and trimmed
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

/**
 * Validate email format (basic)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ============================================================================
// ADDRESS UTILITIES
// ============================================================================

/**
 * Format full address string
 */
export function formatAddress(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): string {
  const parts = [address];

  if (city) parts.push(city);
  if (state) parts.push(state);
  if (zip) parts.push(zip);

  return parts.filter(Boolean).join(', ');
}

// ============================================================================
// NUMBER UTILITIES
// ============================================================================

/**
 * Format number with commas
 */
export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '0';
  return num.toLocaleString();
}

/**
 * Format currency
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Clamp number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/**
 * Get unique values from array
 */
export function unique<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter(Boolean) as T[]));
}

/**
 * Chunk array into smaller arrays of specified size
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry async function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
