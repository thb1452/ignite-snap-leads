import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnlockBalances {
  subscription_remaining: number;
  subscription_limit: number;
  subscription_used: number;
  credit_balance: number;
  free_remaining: number;
  plan_name: string | null;
  renewal_date: string | null;
}

export function useUnlockBalances() {
  return useQuery<UnlockBalances>({
    queryKey: ["unlock-balances"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_get_unlock_balances");
      if (error) throw error;
      return data as UnlockBalances;
    },
    staleTime: 15000,
    retry: 1,
  });
}
