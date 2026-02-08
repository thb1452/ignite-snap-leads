import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/hooks/use-auth";

const ONBOARDING_STORAGE_KEY = 'snap_onboarding_completed';

export function useOnboarding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Fetch onboarding status from database
  const { data: profileData, isLoading } = useQuery({
    queryKey: ["onboarding-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("onboarding_completed")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) {
        console.error("[useOnboarding] Error fetching status:", error);
        const localCompleted = localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
        return { onboarding_completed: localCompleted };
      }

      if (data?.onboarding_completed) {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      }

      // Sync localStorage fallback for existing users
      const localCompleted = localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
      if (localCompleted && data && !data.onboarding_completed) {
        await supabase
          .from("user_profiles")
          .update({ onboarding_completed: true })
          .eq("user_id", user!.id);
        return { ...data, onboarding_completed: true };
      }

      return data || { onboarding_completed: false };
    },
    staleTime: 60000,
  });

  const onboardingCompleted = profileData?.onboarding_completed ?? false;

  // Mutation to mark onboarding complete
  const markCompleteMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;

      const { error } = await supabase
        .from("user_profiles")
        .upsert({
          user_id: user.id,
          onboarding_completed: true,
        }, { onConflict: 'user_id' });

      if (error) {
        console.error("[useOnboarding] Error saving to DB:", error);
      }

      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-profile"] });
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
      queryClient.invalidateQueries({ queryKey: ["onboarding-profile"] });
    }
  }, [user, queryClient]);

  const triggerOnboarding = useCallback(() => {
    setShowOnboarding(true);
  }, []);

  return {
    hasCompletedOnboarding: onboardingCompleted,
    showOnboarding,
    setShowOnboarding,
    markOnboardingComplete,
    resetOnboarding,
    triggerOnboarding,
    isLoading,
  };
}
