import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Home } from "lucide-react";

interface EnforcementSignalsFilterProps {
  selectedSignal: string | null;
  onSignalChange: (value: string | null) => void;
  selectedState: string | null;
  selectedCity: string | null;
}

export function EnforcementSignalsFilter({
  selectedSignal,
  onSignalChange,
  selectedState,
  selectedCity,
}: EnforcementSignalsFilterProps) {
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

      const result = (data || []).map((row: { category_id: string; category_label: string; property_count: number }) => ({
        categoryId: row.category_id,
        label: row.category_label,
        propertyCount: row.property_count,
      }));
      
      console.log("[EnforcementSignalsFilter] Categories:", result.length, result);
      return result;
    },
    staleTime: 60000,
  });

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
          onValueChange={(value) => onSignalChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-full md:w-[240px] h-11 md:h-9">
            <SelectValue placeholder={isLoading ? "Loading..." : "All issues"} />
          </SelectTrigger>
          <SelectContent className="z-[9999]">
            <SelectItem value="all">All issues</SelectItem>
            {categories.map(({ categoryId, label, propertyCount }) => (
              <SelectItem key={categoryId} value={categoryId}>
                {label} — {propertyCount.toLocaleString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
