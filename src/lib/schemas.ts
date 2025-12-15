/**
 * Zod validation schemas
 * Phase 3: Type safety - Runtime validation for API requests and responses
 */

import { z } from 'zod';
import { SNAP_SCORE, VIOLATION_STATUS, LEAD_STATUS } from './constants';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * UUID format validation
 */
export const uuidSchema = z.string().uuid();

/**
 * Email validation
 */
export const emailSchema = z.string().email();

/**
 * Phone number validation (E.164 format)
 */
export const phoneSchema = z.string().regex(/^\+1\d{10}$/);

/**
 * Date string validation (ISO 8601)
 */
export const dateStringSchema = z.string().datetime();

/**
 * URL validation
 */
export const urlSchema = z.string().url();

// ============================================================================
// SNAP SCORE SCHEMAS
// ============================================================================

/**
 * SnapScore value (0-100)
 */
export const snapScoreSchema = z
  .number()
  .int()
  .min(SNAP_SCORE.RANGES.WATCH.MIN)
  .max(SNAP_SCORE.RANGES.DISTRESSED.MAX);

/**
 * SnapScore category
 */
export const snapScoreCategorySchema = z.enum(['DISTRESSED', 'VALUE_ADD', 'WATCH']);

/**
 * SnapScore components
 */
export const snapScoreComponentsSchema = z.object({
  timeScore: z.number().min(0).max(100),
  severityScore: z.number().min(0).max(100),
  repeatScore: z.number().min(0).max(100),
  multiDeptScore: z.number().min(0).max(100),
  escalationScore: z.number().min(0).max(100),
  vacancyScore: z.number().min(0).max(100),
});

// ============================================================================
// PROPERTY SCHEMAS
// ============================================================================

/**
 * Property address
 */
export const propertyAddressSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
});

/**
 * Property coordinates
 */
export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * Full property object
 */
export const propertySchema = z.object({
  id: uuidSchema,
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  snap_score: snapScoreSchema.nullable(),
  snap_insight: z.string().nullable(),
  photo_url: z.string().nullable(),
  created_by: uuidSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Property = z.infer<typeof propertySchema>;

// ============================================================================
// VIOLATION SCHEMAS
// ============================================================================

/**
 * Violation status
 */
export const violationStatusSchema = z.enum([
  VIOLATION_STATUS.OPEN,
  VIOLATION_STATUS.CLOSED,
  VIOLATION_STATUS.PENDING,
  VIOLATION_STATUS.UNKNOWN,
]);

/**
 * Violation object
 */
export const violationSchema = z.object({
  id: uuidSchema,
  property_id: uuidSchema,
  case_id: z.string().nullable(),
  violation_type: z.string(),
  description: z.string().nullable(),
  status: violationStatusSchema,
  opened_date: z.string().nullable(),
  last_updated: z.string().nullable(),
  days_open: z.number().int().nullable(),
  created_at: z.string(),
});

export type Violation = z.infer<typeof violationSchema>;

// ============================================================================
// LEAD ACTIVITY SCHEMAS
// ============================================================================

/**
 * Lead status
 */
export const leadStatusSchema = z.enum([
  LEAD_STATUS.NEW,
  LEAD_STATUS.CONTACTED,
  LEAD_STATUS.QUALIFIED,
  LEAD_STATUS.NEGOTIATING,
  LEAD_STATUS.UNDER_CONTRACT,
  LEAD_STATUS.CLOSED,
  LEAD_STATUS.DEAD,
]);

/**
 * Lead activity object
 */
export const leadActivitySchema = z.object({
  id: uuidSchema,
  property_id: uuidSchema,
  user_id: uuidSchema,
  status: leadStatusSchema.nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LeadActivity = z.infer<typeof leadActivitySchema>;

// ============================================================================
// CONTACT SCHEMAS
// ============================================================================

/**
 * Contact type
 */
export const contactTypeSchema = z.enum(['phone', 'email']);

/**
 * Contact object
 */
export const contactSchema = z.object({
  id: z.string(),
  property_id: uuidSchema,
  type: contactTypeSchema,
  value: z.string(),
  line_type: z.string().nullable(),
  is_dnc: z.boolean().nullable(),
  confidence: z.number().min(0).max(100).nullable(),
  source: z.string().default('skip_trace'),
  created_at: z.string(),
});

export type Contact = z.infer<typeof contactSchema>;

// ============================================================================
// SUBSCRIPTION SCHEMAS
// ============================================================================

/**
 * Subscription tier
 */
export const subscriptionTierSchema = z.enum(['free-trial', 'starter', 'pro', 'elite']);

/**
 * Subscription status
 */
export const subscriptionStatusSchema = z.enum(['active', 'canceled', 'past_due', 'trialing']);

/**
 * Subscription plan
 */
export const subscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: subscriptionTierSchema,
  price_monthly: z.number().min(0),
  max_csv_exports_per_month: z.number().int(),
  skip_trace_credits_per_month: z.number().int(),
  stripe_price_id: z.string().nullable(),
});

export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

/**
 * User subscription
 */
export const userSubscriptionSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  plan_id: z.string(),
  status: subscriptionStatusSchema,
  current_period_start: z.string(),
  current_period_end: z.string(),
  stripe_subscription_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type UserSubscription = z.infer<typeof userSubscriptionSchema>;

// ============================================================================
// API REQUEST SCHEMAS
// ============================================================================

/**
 * Skip trace request
 */
export const skipTraceRequestSchema = z.object({
  property_id: uuidSchema,
  phone_hint: z.string().optional(),
});

export type SkipTraceRequest = z.infer<typeof skipTraceRequestSchema>;

/**
 * CSV export filters
 */
export const csvExportFiltersSchema = z.object({
  city: z.string().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxScore: z.number().int().min(0).max(100).optional(),
  jurisdictionId: uuidSchema.optional(),
});

export type CsvExportFilters = z.infer<typeof csvExportFiltersSchema>;

/**
 * Upload job request
 */
export const uploadJobRequestSchema = z.object({
  file_name: z.string(),
  file_size: z.number().int().positive(),
  city: z.string().min(1),
  state: z.string().length(2),
  county: z.string().optional(),
  jurisdiction_id: uuidSchema.optional(),
});

export type UploadJobRequest = z.infer<typeof uploadJobRequestSchema>;

/**
 * Checkout session request
 */
export const checkoutSessionRequestSchema = z.object({
  plan_id: z.string(),
});

export type CheckoutSessionRequest = z.infer<typeof checkoutSessionRequestSchema>;

// ============================================================================
// API RESPONSE SCHEMAS
// ============================================================================

/**
 * Skip trace response
 */
export const skipTraceResponseSchema = z.object({
  ok: z.boolean(),
  contacts: z.array(contactSchema).optional(),
  error: z.string().optional(),
  raw_data: z.record(z.any()).optional(),
});

export type SkipTraceResponse = z.infer<typeof skipTraceResponseSchema>;

/**
 * Checkout session response
 */
export const checkoutSessionResponseSchema = z.object({
  url: urlSchema,
});

export type CheckoutSessionResponse = z.infer<typeof checkoutSessionResponseSchema>;

/**
 * Usage stats
 */
export const usageStatsSchema = z.object({
  csv_exports_count: z.number().int().min(0),
  skip_traces_used: z.number().int().min(0),
  period_start: z.string(),
  period_end: z.string(),
});

export type UsageStats = z.infer<typeof usageStatsSchema>;

// ============================================================================
// FORM SCHEMAS
// ============================================================================

/**
 * Login form
 */
export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginFormData = z.infer<typeof loginFormSchema>;

/**
 * Signup form
 */
export const signupFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(1, 'Full name is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type SignupFormData = z.infer<typeof signupFormSchema>;

/**
 * Lead note form
 */
export const leadNoteFormSchema = z.object({
  property_id: uuidSchema,
  status: leadStatusSchema.optional(),
  notes: z.string().max(2000, 'Notes must be less than 2000 characters'),
});

export type LeadNoteFormData = z.infer<typeof leadNoteFormSchema>;

/**
 * Create list form
 */
export const createListFormSchema = z.object({
  name: z.string().min(1, 'List name is required').max(100, 'List name must be less than 100 characters'),
});

export type CreateListFormData = z.infer<typeof createListFormSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Safe parse with type guard
 */
export function isSafeParseSuccess<T>(
  result: z.SafeParseReturnType<unknown, T>
): result is z.SafeParseSuccess<T> {
  return result.success;
}

/**
 * Validate and throw on error
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Validation failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate with default value on error
 */
export function validateWithDefault<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  defaultValue: T
): T {
  const result = schema.safeParse(data);
  return result.success ? result.data : defaultValue;
}
