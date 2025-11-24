import { useQuery } from "@tanstack/react-query";
import { fetchJurisdictions } from "@/services/jurisdictions";

export function useJurisdictions() {
  return useQuery({
    queryKey: ["jurisdictions"],
    queryFn: fetchJurisdictions,
  });
}
