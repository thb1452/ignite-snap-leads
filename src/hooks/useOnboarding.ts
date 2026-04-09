import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/hooks/use-auth";

// Use user-specific key to prevent cross-account interference
const getOnboardingStorageKey = (userId: string) => `snap_onboarding_completed_${userId}`;

export function useOnboarding() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const dismissedRef = useRef(false);

  // User-specific storage key
  const storageKey = user?.id ? getOnboardingStorageKey(user.id) : null;

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
        // On error, default to showing onboarding for new users
        const localCompleted = storageKey ? localStorage.getItem(storageKey) === 'true' : false;
        return { onboarding_completed: localCompleted };
      }

      // Sync localStorage for this user
      if (data?.onboarding_completed && storageKey) {
        localStorage.setItem(storageKey, 'true');
      }

      // Sync localStorage fallback for existing users
      const localCompleted = storageKey ? localStorage.getItem(storageKey) === 'true' : false;
      if (localCompleted && data && !data.onboarding_completed) {
        await supabase
          .from("user_profiles")
          .update({ onboarding_completed: true })
          .eq("user_id", user!.id);
        return { ...data, onboarding_completed: true };
      }

      return data || { onboarding_completed: false };
    },
    staleTime: Infinity, // onboarding_completed never changes back to false after being set
  });

  // Only treat as "not completed" when we have a confirmed DB result.
  // profileData === undefined means the query hasn't resolved yet — do not show modal.
  const onboardingCompleted = profileData === undefined ? true : (profileData?.onboarding_completed ?? false);

  // Mutation to mark onboarding complete
  const markCompleteMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;

      // Set localStorage FIRST to prevent race window
      if (storageKey) {
        localStorage.setItem(storageKey, 'true');
      }

      const { error } = await supabase
        .from("user_profiles")
        .upsert({
          user_id: user.id,
          onboarding_completed: true,
        }, { onConflict: 'user_id' });

      if (error) {
        console.error("[useOnboarding] Error saving to DB:", error);
      }
    },
  });

  // Show onboarding if not completed (with delay for UX)
  useEffect(() => {
    if (isLoading || !user) return;

    if (onboardingCompleted === false && !dismissedRef.current) {
      const timer = setTimeout(() => {
        if (!dismissedRef.current) setShowOnboarding(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [onboardingCompleted, isLoading, user]);

  const markOnboardingComplete = useCallback(() => {
    dismissedRef.current = true;
    markCompleteMutation.mutate();
    setShowOnboarding(false);
  }, [markCompleteMutation]);

  const resetOnboarding = useCallback(async () => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
    if (user?.id) {
      await supabase
        .from("user_profiles")
        .update({ onboarding_completed: false })
        .eq("user_id", user.id);
      queryClient.invalidateQueries({ queryKey: ["onboarding-profile"] });
    }
  }, [user, queryClient, storageKey]);

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
