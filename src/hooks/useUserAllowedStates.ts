import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// All US states
export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

export type StateCode = (typeof US_STATES)[number]["code"];

interface UseUserAllowedStatesReturn {
  allowedStates: string[];
  maxStates: number;
  isUnlimited: boolean;
  needsStateSelection: boolean;
  isLoading: boolean;
  isSaving: boolean;
  updateStates: (states: string[]) => Promise<boolean>;
  refetch: () => void;
}

export function useUserAllowedStates(): UseUserAllowedStatesReturn {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's current allowed states
  const { data: statesData, isLoading: isLoadingStates, refetch } = useQuery({
    queryKey: ["user-allowed-states", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_allowed_states")
        .select("state")
        .eq("user_id", user!.id);

      if (error) throw error;
      return data?.map((s) => s.state) ?? [];
    },
    staleTime: 30000,
  });

  // Fetch user's max states from subscription
  const { data: subscriptionData, isLoading: isLoadingSubscription } = useQuery({
    queryKey: ["user-max-states", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_get_user_subscription", {
        p_user_id: user!.id,
      });

      if (error) throw error;
      
      // Get max_states from subscription_plans
      if (data && data.length > 0) {
        const planId = data[0].plan_id;
        const { data: planData } = await supabase
          .from("subscription_plans")
          .select("max_states")
          .eq("id", planId)
          .single();
        
        return planData?.max_states ?? 5;
      }
      
      return 5; // Default to starter limit
    },
    staleTime: 60000,
  });

  // Check if user needs to select states
  const { data: needsSelection } = useQuery({
    queryKey: ["needs-state-selection", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_user_needs_state_selection");
      if (error) throw error;
      return data ?? true;
    },
    staleTime: 10000,
  });

  // Mutation to update states
  const updateMutation = useMutation({
    mutationFn: async (states: string[]) => {
      const { data, error } = await supabase.rpc("fn_update_user_states", {
        p_states: states,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to update states");
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-allowed-states"] });
      queryClient.invalidateQueries({ queryKey: ["needs-state-selection"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["map-markers"] });
      
      toast({
        title: "States Updated",
        description: "Your state selection has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStates = useCallback(async (states: string[]): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync(states);
      return true;
    } catch {
      return false;
    }
  }, [updateMutation]);

  const allowedStates = statesData ?? [];
  const maxStates = subscriptionData ?? 5;
  const isUnlimited = maxStates === 0;

  return {
    allowedStates,
    maxStates,
    isUnlimited,
    needsStateSelection: needsSelection ?? true,
    isLoading: isLoadingStates || isLoadingSubscription,
    isSaving: updateMutation.isPending,
    updateStates,
    refetch,
  };
}
