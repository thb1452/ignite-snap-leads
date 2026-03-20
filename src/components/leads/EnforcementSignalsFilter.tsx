import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";
import { Home, Lock } from "lucide-react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface EnforcementSignalsFilterProps {
  selectedSignal: string | null;
  onSignalChange: (value: string | null) => void;
  selectedState: string | null;
  selectedCity: string | null;
}

// Categories that require enterprise tier
const ENTERPRISE_ONLY_CATEGORIES = ['water_disconnection'];

export function EnforcementSignalsFilter({
  selectedSignal,
  onSignalChange,
  selectedState,
  selectedCity,
}: EnforcementSignalsFilterProps) {
  const { hasFeature } = useFeatureAccess();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const hasEscalationAlerts = isAdmin || hasFeature('escalation_alerts');

  // Fetch property counts by category using the new RPC
  // This returns accurate counts of unique properties per category
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["category-property-counts", selectedState, selectedCity],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_category_property_counts", {
        p_state: selectedState || null,
        p_city: selectedCity || null,
      });

      if (error) {
        console.error("[EnforcementSignalsFilter] RPC error:", error);
        throw error;
      }

      // RPC returns category_id, category_label, property_count
      const result = ((data || []) as unknown as Array<{ category_id: string; category_label: string; property_count: number }>).map((row) => ({
        categoryId: row.category_id,
        label: row.category_label,
        propertyCount: row.property_count,
      }));
      
      console.log("[EnforcementSignalsFilter] Categories:", result.length, result);
      return result;
    },
    staleTime: 60000,
  });

  const handleSignalChange = (value: string) => {
    if (value === "all") {
      onSignalChange(null);
      return;
    }
    
    // Check if this is an enterprise-only category
    if (ENTERPRISE_ONLY_CATEGORIES.includes(value) && !hasEscalationAlerts) {
      toast({
        title: "Elite Feature",
        description: "Water Disconnection data is available on the Elite plan. Upgrade to access properties with utility disconnections.",
        variant: "default",
      });
      navigate('/pricing');
      return;
    }
    
    onSignalChange(value);
  };

  const isLockedCategory = (categoryId: string) => {
    return ENTERPRISE_ONLY_CATEGORIES.includes(categoryId) && !hasEscalationAlerts;
  };

  return (
    <Select
      value={selectedSignal || "all"}
      onValueChange={handleSignalChange}
    >
      <SelectTrigger className="w-[120px] h-7 text-xs">
        <SelectValue placeholder={isLoading ? "..." : "Issue"} />
      </SelectTrigger>
      <SelectContent className="z-[9999]">
        <SelectItem value="all">All issues</SelectItem>
        {categories.map(({ categoryId, label }) => {
          const locked = isLockedCategory(categoryId);
          return (
            <SelectItem 
              key={categoryId} 
              value={categoryId}
              className={locked ? "text-muted-foreground" : ""}
            >
              <span className="flex items-center gap-1">
                {locked && <Lock className="h-3 w-3" />}
                {label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
