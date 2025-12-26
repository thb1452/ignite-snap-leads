import { z } from "zod";

/** Contacts */
export const PropertyContactSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  source: z.string().nullable(),
  raw_payload: z.unknown().nullable().optional(),
  created_at: z.string(),
});
export type PropertyContact = z.infer<typeof PropertyContactSchema>;

/** Skip trace result */
export const SkipTraceResponseSchema = z.object({
  ok: z.literal(true),
  contacts: z.array(PropertyContactSchema),
});
export type SkipTraceResponse = z.infer<typeof SkipTraceResponseSchema>;

/** SMS send */
export const SMSSendSchema = z.object({
  to: z.string().min(8, "Phone required"),
  body: z.string().min(1, "Message required"),
  propertyId: z.string().uuid().optional(),
});
export type SMSSendInput = z.infer<typeof SMSSendSchema>;

/** Email send */
export const EmailSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});
export type EmailSendInput = z.infer<typeof EmailSendSchema>;

/** Filters (use an exact tuple for snapScoreRange) */
export const LeadFiltersSchema = z.object({
  search: z.string().optional(),
  cities: z.array(z.string()).optional(),
  state: z.string().optional(),
  county: z.string().optional(),
  jurisdictionId: z.string().optional(),
  status: z.string().optional(),
  snapScoreRange: z.tuple([z.number(), z.number()]).optional(),
  listId: z.string().optional(),
});
export type LeadFilters = z.infer<typeof LeadFiltersSchema>;
