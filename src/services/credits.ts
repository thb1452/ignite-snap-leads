import { supabase } from "@/integrations/supabase/client";

export async function getCreditBalance(): Promise<number> {
  const { data, error } = await supabase.from("v_user_credits").select("*").single();
  if (error && error.code !== "PGRST116") throw error;  // no row = 0 balance
  return data?.balance ?? 0;
}
