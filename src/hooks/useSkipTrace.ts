import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runSkipTrace } from "@/services/skiptrace";
import { z } from "zod";
import { PropertyContactSchema } from "@/schemas";

export function useSkipTrace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { propertyId: string; phoneHint?: string }) => {
      const contacts = await runSkipTrace(args.propertyId, { phoneHint: args.phoneHint });
      return z.array(PropertyContactSchema).parse(contacts);
    },
    onSuccess: (_contacts, { propertyId }) => {
      qc.invalidateQueries({ queryKey: ["contacts", propertyId] });
      qc.invalidateQueries({ queryKey: ["credits", "balance"] });
    },
  });
}
