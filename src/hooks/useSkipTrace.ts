import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runSkipTrace } from "@/services/skiptrace";
import { SkipTraceResponseSchema } from "@/schemas";

export function useSkipTrace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { propertyId: string; phoneHint?: string }) => {
      const contacts = await runSkipTrace(args.propertyId, { phoneHint: args.phoneHint });
      // validate shape (defense in depth)
      const parsed = SkipTraceResponseSchema.shape.contacts.safeParse(contacts);
      if (!parsed.success) throw new Error("Skip trace: bad payload");
      return parsed.data;
    },
    onSuccess: (_contacts, { propertyId }) => {
      qc.invalidateQueries({ queryKey: ["contacts", propertyId] });
      qc.invalidateQueries({ queryKey: ["credits", "balance"] });
    },
  });
}
