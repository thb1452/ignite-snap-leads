import { supabase } from "@/integrations/supabase/client";

export async function getUserCredits(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return 0;
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .select("credits")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Error fetching user credits:", error);
    return 0;
  }

  return data?.credits ?? 0;
}
