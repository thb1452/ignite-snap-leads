import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  org_id: string;
  created_at: string;
}

interface OrganizationData {
  id: string;
  name: string;
}

export function useProfileSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile-settings"],
    queryFn: async (): Promise<ProfileData | null> => {
      // Use getSession for reliability - getUser makes a network call that can fail
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        // Return a minimal profile with the auth user's email even if profiles row is missing
        return {
          id: user.id,
          user_id: user.id,
          email: user.email || null,
          full_name: user.user_metadata?.full_name || null,
          org_id: '',
          created_at: user.created_at || new Date().toISOString(),
        };
      }

      // If no profile row found, return fallback from auth session
      if (!data) {
        return {
          id: user.id,
          user_id: user.id,
          email: user.email || null,
          full_name: user.user_metadata?.full_name || null,
          org_id: '',
          created_at: user.created_at || new Date().toISOString(),
        };
      }

      // If profile exists but email is null, fall back to auth user email
      if (!data.email) {
        return { ...data, email: user.email || null };
      }

      return data;
    },
  });

  const { data: organization, isLoading: orgLoading } = useQuery({
    queryKey: ["organization-settings", profile?.org_id],
    queryFn: async (): Promise<OrganizationData | null> => {
      if (!profile?.org_id) return null;

      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", profile.org_id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching organization:", error);
        return null;
      }

      return data;
    },
    enabled: !!profile?.org_id,
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: { full_name?: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been saved.",
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

  const requestPasswordReset = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user?.email) throw new Error("No email found");

      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Password Reset Email Sent",
        description: "Check your inbox for the password reset link.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Reset Email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    profile,
    organization,
    isLoading: profileLoading || orgLoading,
    updateProfile,
    requestPasswordReset,
  };
}
