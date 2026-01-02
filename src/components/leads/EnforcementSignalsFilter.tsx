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

// Valid enforcement signal types
const VALID_SIGNAL_TYPES = [
  'Exterior',
  'Structural', 
  'Zoning',
  'Safety',
  'Utility',
  'Vacancy',
  'Fire',
  'Environmental Nuisance',
  'Property Maintenance',
  'Unpermitted Construction',
];

export function EnforcementSignalsFilter({
  selectedSignal,
  onSignalChange,
  selectedState,
  selectedCity,
}: EnforcementSignalsFilterProps) {
  // Fetch violation types with SCOPED counts using server-side RPC
  const { data: signalTypes = [], isLoading } = useQuery({
    queryKey: ["enforcement-signals", selectedState, selectedCity],
    queryFn: async () => {
      // Call the RPC function for server-side computation
      const { data, error } = await supabase.rpc("fn_violation_counts_by_area", {
        p_state: selectedState || null,
        p_city: selectedCity || null,
      });

      if (error) {
        console.error("[EnforcementSignalsFilter] RPC error:", error);
        throw error;
      }

      // Filter to only valid signal types and format response
      const results = (data || [])
        .filter((row: { violation_type: string; count: number }) => 
          VALID_SIGNAL_TYPES.includes(row.violation_type)
        )
        .map((row: { violation_type: string; count: number }) => ({
          type: row.violation_type,
          count: row.count,
        }));

      console.log("[EnforcementSignalsFilter] Server-side counts:", results.length, "types");
      return results;
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Active Enforcement Signals
        </Label>
        {/* Scope disclaimer */}
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Signal counts reflect total violations within the selected enforcement area, not unique properties.
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Signal Type</Label>
        <Select
          value={selectedSignal || "all"}
          onValueChange={(value) => onSignalChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-full md:w-[200px] h-11 md:h-9">
            <SelectValue placeholder={isLoading ? "Loading..." : "All signals"} />
          </SelectTrigger>
          <SelectContent className="z-[9999]">
            <SelectItem value="all">All signals</SelectItem>
            {signalTypes.map(({ type, count }) => (
              <SelectItem key={type} value={type}>
                {type} ({count.toLocaleString()})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
