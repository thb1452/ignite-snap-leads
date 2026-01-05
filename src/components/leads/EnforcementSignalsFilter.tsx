import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";

interface EnforcementSignalsFilterProps {
  selectedSignal: string | null;
  onSignalChange: (value: string | null) => void;
  // Enforcement area context for scoped counts
  selectedState: string | null;
  selectedCity: string | null;
}

interface SignalTypeWithCounts {
  type: string;
  violationCount: number;
  propertyCount: number;
}

export function EnforcementSignalsFilter({
  selectedSignal,
  onSignalChange,
  selectedState,
  selectedCity,
}: EnforcementSignalsFilterProps) {
  // Fetch violation types with SCOPED counts
  const { data: signalTypes = [], isLoading } = useQuery({
    queryKey: ["enforcement-signals-v3", selectedState, selectedCity],
    queryFn: async () => {
      // Call the RPC function for violation counts
      const { data: violationData, error: violationError } = await supabase.rpc("fn_violation_counts_by_area", {
        p_state: selectedState || null,
        p_city: selectedCity || null,
      });

      if (violationError) {
        console.error("[EnforcementSignalsFilter] RPC error:", violationError);
        throw violationError;
      }

      // Filter out empty types
      const validTypes = (violationData || []).filter(
        (row: { violation_type: string }) => row.violation_type && row.violation_type.trim() !== ''
      );

      // Get unique property counts for each type using a single aggregated query
      // We query properties with violation_types array and count unique properties per type
      const typeList = validTypes.map((r: { violation_type: string }) => r.violation_type);
      
      // Build a query to count properties per violation type
      let propertyQuery = supabase
        .from("properties")
        .select("id, violation_types");
      
      if (selectedState) {
        propertyQuery = propertyQuery.ilike("state", selectedState);
      }
      if (selectedCity) {
        propertyQuery = propertyQuery.ilike("city", selectedCity);
      }
      
      // Get properties with violation types
      const { data: propertyData, error: propertyError } = await propertyQuery
        .not("violation_types", "is", null)
        .limit(10000); // Reasonable limit for counting
      
      if (propertyError) {
        console.error("[EnforcementSignalsFilter] Property query error:", propertyError);
      }

      // Count properties per violation type client-side
      const propertyCountByType: Record<string, number> = {};
      for (const type of typeList) {
        propertyCountByType[type] = 0;
      }
      
      for (const prop of (propertyData || [])) {
        const types = prop.violation_types as string[] | null;
        if (types) {
          for (const type of types) {
            if (propertyCountByType[type] !== undefined) {
              propertyCountByType[type]++;
            }
          }
        }
      }

      // Combine results
      const results: SignalTypeWithCounts[] = validTypes.map((row: { violation_type: string; count: number }) => ({
        type: row.violation_type,
        violationCount: row.count,
        propertyCount: propertyCountByType[row.violation_type] || 0,
      }));

      // Sort by violation count descending
      results.sort((a, b) => b.violationCount - a.violationCount);

      console.log("[EnforcementSignalsFilter] Signal types:", results.length);
      return results;
    },
    staleTime: 60000, // Cache for 60 seconds
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Active Enforcement Signals
        </Label>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Counts: violations / unique properties
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Signal Type</Label>
        <Select
          value={selectedSignal || "all"}
          onValueChange={(value) => onSignalChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-full md:w-[320px] h-11 md:h-9">
            <SelectValue placeholder={isLoading ? "Loading..." : "All signals"} />
          </SelectTrigger>
          <SelectContent className="z-[9999] max-w-[400px]">
            <SelectItem value="all">All signals</SelectItem>
            {signalTypes.map(({ type, violationCount, propertyCount }) => (
              <SelectItem key={type} value={type}>
                {type} — {violationCount.toLocaleString()} / {propertyCount.toLocaleString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
