import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

/**
 * Hook to track daily property views and enforce the 10-view limit.
 */
export function useViewLimit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: viewData, isLoading } = useQuery({
    queryKey: ["view-limit", user?.id],
    queryFn: async () => {
      if (!user?.id) return { view_count: 0, limit: 10, limit_reached: false };

      // Read current count from profile (lazy-reset handled by fn_record_view)
      const { data } = await supabase
        .from("profiles")
        .select("daily_view_count, daily_view_reset_at")
        .eq("user_id", user.id)
        .single();

      const resetAt = data?.daily_view_reset_at
        ? new Date(data.daily_view_reset_at)
        : new Date(0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // If reset is before today, count is effectively 0
      const count = resetAt < today ? 0 : (data?.daily_view_count ?? 0);
      return { view_count: count, limit: 10, limit_reached: count >= 10 };
    },
    enabled: !!user?.id,
    staleTime: 10000,
  });

  const recordViewMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase.rpc("fn_record_view", {
        p_user_id: user.id,
      });
      if (error) throw error;
      return data as { view_count: number; limit: number; limit_reached: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["view-limit"] });
    },
  });

  const recordView = useCallback(() => {
    if (user?.id) {
      recordViewMutation.mutate();
    }
  }, [user?.id, recordViewMutation]);

  return {
    viewCount: viewData?.view_count ?? 0,
    viewLimit: viewData?.limit ?? 10,
    limitReached: viewData?.limit_reached ?? false,
    isLoading,
    recordView,
  };
}
