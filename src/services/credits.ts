import { supabase } from "@/integrations/supabase/client";

export async function getCreditBalance(): Promise<number> {
  try {
    const { data, error } = await supabase.from("v_user_credits").select("balance").maybeSingle();
    if (error) {
      console.error("[getCreditBalance] Error:", error);
      return 0;
    }
    return data?.balance ?? 0;
  } catch (e) {
    console.error("[getCreditBalance] Exception:", e);
    return 0;
  }
}
