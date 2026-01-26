import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  bulkAddToList, 
  addFilteredToList, 
  getUserLists, 
  getListProperties,
  createList,
  removeFromList,
  type AddFilteredToListParams,
  type UserList,
  type ListPropertiesResult 
} from "@/services/lists";

export function useBulkAddToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { listId: string; propertyIds: string[] }) =>
      bulkAddToList(args.listId, args.propertyIds),
    onSuccess: (_count, { listId }) => {
      qc.invalidateQueries({ queryKey: ["lists"] });
      qc.invalidateQueries({ queryKey: ["list", listId] });
    },
  });
}

export function useAddFilteredToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: AddFilteredToListParams) => addFilteredToList(params),
    onSuccess: (_result, params) => {
      qc.invalidateQueries({ queryKey: ["lists"] });
      qc.invalidateQueries({ queryKey: ["list", params.listId] });
    },
  });
}

export function useUserLists() {
  return useQuery<UserList[]>({
    queryKey: ["lists"],
    queryFn: getUserLists,
    staleTime: 30000,
  });
}

export function useListProperties(listId: string | null, page: number = 1, pageSize: number = 50) {
  return useQuery<ListPropertiesResult>({
    queryKey: ["list", listId, page, pageSize],
    queryFn: () => getListProperties(listId!, page, pageSize),
    enabled: !!listId,
    staleTime: 30000,
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createList(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lists"] });
    },
  });
}

export function useRemoveFromList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { listId: string; propertyIds: string[] }) =>
      removeFromList(args.listId, args.propertyIds),
    onSuccess: (_count, { listId }) => {
      qc.invalidateQueries({ queryKey: ["lists"] });
      qc.invalidateQueries({ queryKey: ["list", listId] });
    },
  });
}
