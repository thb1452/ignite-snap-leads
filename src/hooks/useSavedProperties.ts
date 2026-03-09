import { useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/externalClient";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { logActivity } from "@/services/activityLogger";

const QUERY_KEY = "saved-properties";

export function useSavedProperties() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all saved property IDs for this user
  const { data: savedIds = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_properties")
        .select("property_id")
        .eq("user_id", user!.id);

      if (error) {
        console.error("[useSavedProperties] fetch error:", error);
        return [] as string[];
      }

      type SavedRow = { property_id: string };
      return (data as SavedRow[]).map((r) => r.property_id);
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  const isSaved = useCallback(
    (propertyId: string) => savedSet.has(propertyId),
    [savedSet]
  );

  // Toggle mutation with optimistic update
  const toggleMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const currently = savedSet.has(propertyId);
      if (currently) {
        const { error } = await supabase
          .from("saved_properties")
          .delete()
          .eq("user_id", user.id)
          .eq("property_id", propertyId);
        if (error) throw error;
        return { propertyId, action: "removed" as const };
      } else {
        const { error } = await supabase
          .from("saved_properties")
          .insert({ user_id: user.id, property_id: propertyId });
        if (error) throw error;
        return { propertyId, action: "added" as const };
      }
    },
    onMutate: async (propertyId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [QUERY_KEY, user?.id] });

      // Snapshot previous value
      const previous = queryClient.getQueryData<string[]>([QUERY_KEY, user?.id]);

      // Optimistically update
      queryClient.setQueryData<string[]>([QUERY_KEY, user?.id], (old = []) => {
        if (old.includes(propertyId)) {
          return old.filter((id) => id !== propertyId);
        }
        return [...old, propertyId];
      });

      return { previous };
    },
    onError: (_err, _propertyId, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData([QUERY_KEY, user?.id], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user?.id] });
    },
  });

  const toggleSaved = useCallback(
    (propertyId: string) => {
      toggleMutation.mutate(propertyId);
    },
    [toggleMutation]
  );

  return {
    savedIds,
    savedSet,
    isSaved,
    toggleSaved,
    isLoading,
    savedCount: savedIds.length,
  };
}
