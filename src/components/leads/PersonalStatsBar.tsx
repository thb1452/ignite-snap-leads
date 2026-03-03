import { Heart, ListChecks, Flame } from "lucide-react";
import { useSavedProperties } from "@/hooks/useSavedProperties";
import { useUserLists } from "@/hooks/useLists";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";

export function PersonalStatsBar() {
  const { savedCount, isLoading: savedLoading } = useSavedProperties();
  const { data: lists = [], isLoading: listsLoading } = useUserLists();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Count properties with new activity (updated in last 7 days)
  const { data: heatingUpCount = 0 } = useQuery({
    queryKey: ["heating-up-count", user?.id],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count, error } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .or(`updated_at.gte.${sevenDaysAgo.toISOString()},newest_violation_date.gte.${sevenDaysAgo.toISOString()}`);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!user?.id,
    staleTime: 120_000,
  });

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <button
        onClick={() => navigate("/saved")}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <Heart className="h-3.5 w-3.5 text-red-500 fill-current" />
        <span className="font-medium text-foreground">
          {savedLoading ? "—" : savedCount}
        </span>
        Saved
      </button>

      <span className="text-border">|</span>

      <button
        onClick={() => navigate("/lists")}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">
          {listsLoading ? "—" : lists.length}
        </span>
        Lists
      </button>

      <span className="text-border">|</span>

      <div className="flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 text-orange-500" />
        <span className="font-medium text-foreground">
          {heatingUpCount.toLocaleString()}
        </span>
        heating up
      </div>
    </div>
  );
}
