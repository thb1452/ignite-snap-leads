import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const ONBOARDING_STORAGE_KEY = 'snap_onboarding_completed';

export function useOnboarding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Fetch onboarding status from database
  const { data: onboardingCompleted, isLoading } = useQuery({
    queryKey: ["onboarding-completed", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // First check database
      const { data, error } = await supabase
        .from("user_profiles")
        .select("onboarding_completed")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) {
        console.error("[useOnboarding] Error fetching status:", error);
        // Fall back to localStorage
        return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
      }
      
      // If db has it as completed, trust that
      if (data?.onboarding_completed) {
        // Sync to localStorage for faster checks
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
        return true;
      }
      
      // Check localStorage as fallback (for existing users who completed before db column existed)
      const localCompleted = localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
      if (localCompleted && data) {
        // Sync to database
        await supabase
          .from("user_profiles")
          .update({ onboarding_completed: true })
          .eq("user_id", user!.id);
      }
      
      return localCompleted;
    },
    staleTime: 60000,
  });

  // Mutation to mark onboarding complete
  const markCompleteMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      
      // Update database
      const { error } = await supabase
        .from("user_profiles")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);

      if (error) {
        console.error("[useOnboarding] Error saving to DB:", error);
      }
      
      // Also set localStorage for immediate feedback
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-completed"] });
    },
  });

  // Show onboarding if not completed (with delay for UX)
  useEffect(() => {
    if (isLoading || !user) return;
    
    if (onboardingCompleted === false) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [onboardingCompleted, isLoading, user]);

  const markOnboardingComplete = useCallback(() => {
    markCompleteMutation.mutate();
    setShowOnboarding(false);
  }, [markCompleteMutation]);

  const resetOnboarding = useCallback(async () => {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    if (user?.id) {
      await supabase
        .from("user_profiles")
        .update({ onboarding_completed: false })
        .eq("user_id", user.id);
      queryClient.invalidateQueries({ queryKey: ["onboarding-completed"] });
    }
  }, [user, queryClient]);

  const triggerOnboarding = useCallback(() => {
    setShowOnboarding(true);
  }, []);

  return {
    hasCompletedOnboarding: onboardingCompleted ?? false,
    showOnboarding,
    setShowOnboarding,
    markOnboardingComplete,
    resetOnboarding,
    triggerOnboarding,
    isLoading,
  };
}