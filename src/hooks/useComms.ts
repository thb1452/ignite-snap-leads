import { useMutation } from "@tanstack/react-query";
import { sendSMS, sendEmail } from "@/services/comms";
import { SMSSendSchema, EmailSendSchema } from "@/schemas";

export function useSendSMS() {
  return useMutation({
    mutationFn: async (input: { to: string; body: string; propertyId?: string }) => {
      const parsed = SMSSendSchema.parse(input);
      return await sendSMS({ to: parsed.to, body: parsed.body, propertyId: parsed.propertyId });
    },
  });
}

export function useSendEmail() {
  return useMutation({
    mutationFn: async (input: { to: string; subject: string; html: string }) => {
      const parsed = EmailSendSchema.parse(input);
      return await sendEmail({ to: parsed.to, subject: parsed.subject, html: parsed.html });
    },
  });
}
