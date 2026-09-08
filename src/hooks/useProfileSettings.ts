import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { createProfileGateway } from "@/services/profileGateway";
import { loadProfileReadiness, profileReadinessMessage, saveProfileName } from "@/services/profileReadiness";
import type { ProfileReadiness } from "@/services/profileReadiness";

const gateway = createProfileGateway(supabase);

export function useProfileSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const queryKey = ["profile-settings", userId];
  const query = useQuery({
    queryKey,
    queryFn: () => loadProfileReadiness(gateway, userId!),
    enabled: !!userId && !authLoading,
    retry: false,
    staleTime: 0,
    placeholderData: undefined,
  });
  const state: ProfileReadiness = userId && query.data &&
    (query.data.status !== "ready" || query.data.profile.user_id === userId)
    ? query.data
    : { status: userId ? "unavailable" : "signed_out", profile: null, organization: null };
  const profile = state.status === "ready" ? state.profile : null;
  const organization = state.status === "ready" ? state.organization : null;

  const updateProfile = useMutation({
    retry: false,
    mutationFn: async (updates: { full_name?: string }) => {
      if (!userId || !profile || typeof updates.full_name !== "string")
        throw new Error("Your account details are not ready to update.");
      await saveProfileName(gateway, userId, profile.id, updates.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Profile Updated", description: "Your profile has been saved." });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Your details could not be updated. Refresh and try again.", variant: "destructive" });
    },
  });

  const requestPasswordReset = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!userId) throw new Error("Sign in again before changing your password.");
      const fresh = await loadProfileReadiness(gateway, userId);
      if (fresh.status !== "ready") throw new Error("Your account could not be verified.");
      // The existing Auth password-reset flow replaces the absent custom Edge function.
      const result = await supabase.auth.resetPasswordForEmail(fresh.profile.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) throw new Error("Password reset could not be requested.");
    },
    onSuccess: () => {
      toast({ title: "Password Reset Email Sent", description: "Check your inbox for the password reset link." });
    },
    onError: () => {
      toast({ title: "Failed to Send Reset Email", description: "Try again shortly, or use the sign-in page to reset your password.", variant: "destructive" });
    },
  });

  return { profile, organization, readiness: state.status,
    readinessMessage: profileReadinessMessage(state.status),
    isLoading: authLoading || (!!userId && query.isPending),
    refreshProfile: query.refetch, updateProfile, requestPasswordReset };
}
