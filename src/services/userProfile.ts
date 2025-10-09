import { supabase } from "@/integrations/supabase/client";

export async function getUserCredits(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return 0;
  }

  // Use the v_user_credits view instead of user_profiles
  const { data, error } = await supabase
    .from("v_user_credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching user credits:", error);
    return 0;
  }

  return data?.balance ?? 0;
}
