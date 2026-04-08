import { supabase } from "@/integrations/supabase/externalClient";
import { withTimeout } from "@/lib/withTimeout";

export async function getCreditBalance(): Promise<number> {
  try {
    const { data, error } = await withTimeout(
      supabase.from("v_user_credits").select("balance").maybeSingle(),
      8000,
      'Credit balance lookup timed out',
    );

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
