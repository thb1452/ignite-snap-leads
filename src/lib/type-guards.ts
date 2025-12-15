/**
 * Type guards for runtime type checking
 * Phase 3: Type safety - Ensures runtime type safety with type narrowing
 */

import type { Database } from '@/integrations/supabase/types';

// ============================================================================
// DATABASE TYPE HELPERS
// ============================================================================

type Property = Database['public']['Tables']['properties']['Row'];
type Violation = Database['public']['Tables']['violations']['Row'];
type LeadActivity = Database['public']['Tables']['lead_activity']['Row'];
type Contact = Database['public']['Tables']['property_contacts']['Row'];

// ============================================================================
// BASIC TYPE GUARDS
// ============================================================================

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if value is an object (not null, not array)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

// ============================================================================
// UUID TYPE GUARD
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if value is a valid UUID
 */
export function isUUID(value: unknown): value is string {
  return isString(value) && UUID_REGEX.test(value);
}

// ============================================================================
// EMAIL TYPE GUARD
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check if value is a valid email
 */
export function isEmail(value: unknown): value is string {
  return isString(value) && EMAIL_REGEX.test(value);
}

// ============================================================================
// PROPERTY TYPE GUARDS
// ============================================================================

/**
 * Check if object has required property fields
 */
export function isProperty(value: unknown): value is Property {
  if (!isObject(value)) return false;

  const obj = value as Record<string, unknown>;

  return (
    isUUID(obj.id) &&
    isString(obj.address) &&
    isString(obj.city) &&
    isString(obj.state) &&
    isString(obj.zip)
  );
}

/**
 * Check if array contains only properties
 */
export function isPropertyArray(value: unknown): value is Property[] {
  return isArray(value) && value.every(isProperty);
}

/**
 * Check if property has coordinates
 */
export function hasCoordinates(
  property: Property
): property is Property & { latitude: number; longitude: number } {
  return (
    isNumber(property.latitude) &&
    isNumber(property.longitude) &&
    property.latitude !== null &&
    property.longitude !== null
  );
}

/**
 * Check if property has snap score
 */
export function hasSnapScore(
  property: Property
): property is Property & { snap_score: number } {
  return isNumber(property.snap_score) && property.snap_score !== null;
}

// ============================================================================
// VIOLATION TYPE GUARDS
// ============================================================================

/**
 * Check if object is a violation
 */
export function isViolation(value: unknown): value is Violation {
  if (!isObject(value)) return false;

  const obj = value as Record<string, unknown>;

  return (
    isUUID(obj.id) &&
    isUUID(obj.property_id) &&
    isString(obj.violation_type) &&
    isString(obj.status)
  );
}

/**
 * Check if array contains only violations
 */
export function isViolationArray(value: unknown): value is Violation[] {
  return isArray(value) && value.every(isViolation);
}

// ============================================================================
// LEAD ACTIVITY TYPE GUARDS
// ============================================================================

/**
 * Check if object is lead activity
 */
export function isLeadActivity(value: unknown): value is LeadActivity {
  if (!isObject(value)) return false;

  const obj = value as Record<string, unknown>;

  return isUUID(obj.id) && isUUID(obj.property_id) && isUUID(obj.user_id);
}

// ============================================================================
// CONTACT TYPE GUARDS
// ============================================================================

/**
 * Check if object is a contact
 */
export function isContact(value: unknown): value is Contact {
  if (!isObject(value)) return false;

  const obj = value as Record<string, unknown>;

  return (
    isString(obj.id) &&
    isUUID(obj.property_id) &&
    isString(obj.type) &&
    isString(obj.value)
  );
}

/**
 * Check if array contains only contacts
 */
export function isContactArray(value: unknown): value is Contact[] {
  return isArray(value) && value.every(isContact);
}

/**
 * Check if contact is a phone contact
 */
export function isPhoneContact(
  contact: Contact
): contact is Contact & { type: 'phone' } {
  return contact.type === 'phone';
}

/**
 * Check if contact is an email contact
 */
export function isEmailContact(
  contact: Contact
): contact is Contact & { type: 'email' } {
  return contact.type === 'email';
}

// ============================================================================
// API RESPONSE TYPE GUARDS
// ============================================================================

/**
 * Check if response is a success response with data
 */
export function isSuccessResponse<T>(
  response: unknown
): response is { ok: true; data: T } {
  return (
    isObject(response) &&
    response.ok === true &&
    'data' in response &&
    response.data !== undefined
  );
}

/**
 * Check if response is an error response
 */
export function isErrorResponse(
  response: unknown
): response is { ok: false; error: string } {
  return (
    isObject(response) &&
    response.ok === false &&
    'error' in response &&
    isString(response.error)
  );
}

/**
 * Check if error has a specific code
 */
export function hasErrorCode(
  error: unknown,
  code: string
): error is { code: string; message?: string } {
  return (
    isObject(error) &&
    'code' in error &&
    isString(error.code) &&
    error.code === code
  );
}

// ============================================================================
// SUPABASE RESPONSE TYPE GUARDS
// ============================================================================

/**
 * Check if Supabase query returned data
 */
export function hasData<T>(
  result: { data: T | null; error: unknown }
): result is { data: T; error: null } {
  return result.data !== null && result.error === null;
}

/**
 * Check if Supabase query returned error
 */
export function hasError<E>(
  result: { data: unknown; error: E | null }
): result is { data: null; error: E } {
  return result.error !== null;
}

// ============================================================================
// PAGINATION TYPE GUARDS
// ============================================================================

/**
 * Check if object is a paginated response
 */
export function isPaginatedResponse<T>(
  value: unknown
): value is {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  if (!isObject(value)) return false;

  const obj = value as Record<string, unknown>;

  return (
    isArray(obj.data) &&
    isNumber(obj.count) &&
    isNumber(obj.page) &&
    isNumber(obj.pageSize) &&
    isNumber(obj.totalPages)
  );
}

// ============================================================================
// FORM DATA TYPE GUARDS
// ============================================================================

/**
 * Check if value is FormData
 */
export function isFormData(value: unknown): value is FormData {
  return value instanceof FormData;
}

/**
 * Check if value is File
 */
export function isFile(value: unknown): value is File {
  return value instanceof File;
}

/**
 * Check if value is Blob
 */
export function isBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}

// ============================================================================
// DATE TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid Date object
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if string is a valid ISO date string
 */
export function isISODateString(value: unknown): value is string {
  if (!isString(value)) return false;

  const date = new Date(value);
  return isValidDate(date);
}

// ============================================================================
// UTILITY TYPE GUARDS
// ============================================================================

/**
 * Assert that a value is defined (not null or undefined)
 * Throws an error if the value is nullish
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (isNullish(value)) {
    throw new Error(message);
  }
}

/**
 * Assert that a value is a non-empty array
 */
export function assertNonEmptyArray<T>(
  value: T[],
  message = 'Array is empty'
): asserts value is [T, ...T[]] {
  if (value.length === 0) {
    throw new Error(message);
  }
}

/**
 * Narrow unknown to T or throw error
 */
export function assertType<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  message = 'Type assertion failed'
): asserts value is T {
  if (!guard(value)) {
    throw new Error(message);
  }
}

/**
 * Filter array to only include defined values
 */
export function filterDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => !isNullish(item));
}

/**
 * Get property safely with type checking
 */
export function getProperty<T, K extends keyof T>(
  obj: T,
  key: K
): T[K] | undefined {
  if (!isObject(obj)) return undefined;
  return obj[key];
}
