import { z } from "zod";

export const LeadFiltersSchema = z.object({
  search: z.string().optional(),
  cities: z.array(z.string()).optional(),
  status: z.string().optional(),
  snapScoreRange: z.array(z.number()).length(2).optional().transform(val => val as [number, number] | undefined),
  listId: z.string().optional(),
});
export type LeadFilters = z.infer<typeof LeadFiltersSchema>;

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

export const SkipTraceResponseSchema = z.object({
  ok: z.literal(true),
  contacts: z.array(PropertyContactSchema),
});
export type SkipTraceResponse = z.infer<typeof SkipTraceResponseSchema>;

export const SMSSendSchema = z.object({
  to: z.string().min(8, "Phone required"),
  body: z.string().min(1, "Message required"),
  propertyId: z.string().uuid().optional(),
});
export type SMSSendInput = z.infer<typeof SMSSendSchema>;

export const EmailSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});
export type EmailSendInput = z.infer<typeof EmailSendSchema>;
