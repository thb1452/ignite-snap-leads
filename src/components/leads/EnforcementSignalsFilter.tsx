import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Home, Lock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
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
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const isEnterprise = subscription?.plan_name === 'enterprise';

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

      // RPC returns cat_id, cat_label, cnt (need to cast since generated types may differ)
      const result = ((data || []) as unknown as Array<{ cat_id: string; cat_label: string; cnt: number }>).map((row) => ({
        categoryId: row.cat_id,
        label: row.cat_label,
        propertyCount: row.cnt,
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
    if (ENTERPRISE_ONLY_CATEGORIES.includes(value) && !isEnterprise) {
      toast({
        title: "Enterprise Feature",
        description: "Water Disconnection data is available on the Enterprise plan. Upgrade to access properties with utility disconnections.",
        variant: "default",
      });
      navigate('/pricing');
      return;
    }
    
    onSignalChange(value);
  };

  const isLockedCategory = (categoryId: string) => {
    return ENTERPRISE_ONLY_CATEGORIES.includes(categoryId) && !isEnterprise;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Issue Type
        </Label>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Home className="h-3 w-3" />
          Properties with these issues
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Category</Label>
        <Select
          value={selectedSignal || "all"}
          onValueChange={handleSignalChange}
        >
          <SelectTrigger className="w-full md:w-[240px] h-11 md:h-9">
            <SelectValue placeholder={isLoading ? "Loading..." : "All issues"} />
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
                  <span className="flex items-center gap-2">
                    {locked && <Lock className="h-3 w-3 text-amber-500" />}
                    {label}
                    {locked && <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">(Enterprise)</span>}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
