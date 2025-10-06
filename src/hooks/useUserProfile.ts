import { useQuery } from "@tanstack/react-query";
import { getUserCredits } from "@/services/userProfile";

export function useUserCredits() {
  return useQuery({
    queryKey: ["user", "credits"],
    queryFn: getUserCredits,
    refetchInterval: 30000, // Refresh every 30s
  });
}
