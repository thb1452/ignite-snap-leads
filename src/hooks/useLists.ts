import { useMutation, useQueryClient } from "@tanstack/react-query";
import { bulkAddToList } from "@/services/lists";

export function useBulkAddToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { listId: string; propertyIds: string[] }) =>
      bulkAddToList(args.listId, args.propertyIds),
    onSuccess: (_count, { listId }) => {
      qc.invalidateQueries({ queryKey: ["lists", listId] });
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
  });
}
