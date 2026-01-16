import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Home } from "lucide-react";
import { aggregateByCategory, VIOLATION_CATEGORIES } from "@/utils/violationCategoryMapper";

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
  // Fetch violation types and aggregate into user-friendly categories
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["violation-categories", selectedState, selectedCity],
    queryFn: async () => {
      // Get violation counts from RPC - this already has the correct counts!
      const { data: violationData, error: violationError } = await supabase.rpc("fn_violation_counts_by_area", {
        p_state: selectedState || null,
        p_city: selectedCity || null,
      });

      if (violationError) {
        console.error("[EnforcementSignalsFilter] RPC error:", violationError);
        throw violationError;
      }

      // Filter out empty types and use the RPC counts directly
      const rawTypes = (violationData || [])
        .filter((row: { violation_type: string; count: number }) => 
          row.violation_type && row.violation_type.trim() !== ''
        )
        .map((row: { violation_type: string; count: number }) => ({
          type: row.violation_type,
          propertyCount: row.count,
        }));

      // Aggregate into user-friendly categories
      const aggregated = aggregateByCategory(rawTypes);
      
      console.log("[EnforcementSignalsFilter] Categories:", aggregated.length, aggregated);
      return aggregated;
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