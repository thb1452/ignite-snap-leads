import { useQuery } from "@tanstack/react-query";
import { getCreditBalance } from "@/services/credits";

export function useCreditBalance() {
  return useQuery({
    queryKey: ["credits", "balance"],
    queryFn: getCreditBalance,
  });
}
