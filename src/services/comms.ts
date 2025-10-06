import { callFn } from "@/integrations/http/functions";

export async function sendSMS(args: { to: string; body: string; propertyId?: string }) {
  const res = await callFn<{ ok: boolean; sid: string }>("sms-send", {
    to: args.to,
    body: args.body,
    property_id: args.propertyId ?? null,
  });
  if (!res?.ok) throw new Error("SMS send failed");
  return res.sid;
}

export async function sendEmail(args: { to: string; subject: string; html: string }) {
  const res = await callFn<{ ok: boolean; id: string }>("email-send", {
    to: args.to,
    subject: args.subject,
    html: args.html,
  });
  if (!res?.ok) throw new Error("Email send failed");
  return res.id;
}
