import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSkipTraceConsent() {
  const [hasConsented, setHasConsented] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConsent();
  }, []);

  const checkConsent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_profiles")
        .select("consented_skiptrace")
        .eq("user_id", user.id)
        .maybeSingle();

      setHasConsented(data?.consented_skiptrace ?? false);
    } catch (error) {
      console.error("Error checking consent:", error);
    } finally {
      setLoading(false);
    }
  };

  const giveConsent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_profiles")
        .update({ consented_skiptrace: true })
        .eq("user_id", user.id);

      if (error) throw error;
      setHasConsented(true);
    } catch (error) {
      console.error("Error giving consent:", error);
      throw error;
    }
  };

  return { hasConsented, loading, giveConsent };
}
