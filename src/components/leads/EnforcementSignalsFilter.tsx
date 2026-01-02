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
  // Fetch violation types with SCOPED counts based on enforcement area
  const { data: signalTypes = [], isLoading } = useQuery({
    queryKey: ["enforcement-signals", selectedState, selectedCity],
    queryFn: async () => {
      // Build query to get violations scoped to enforcement area
      let query = supabase
        .from("violations")
        .select(`
          violation_type,
          property:properties!inner(id, state, city)
        `)
        .not("violation_type", "is", null);
      
      // The inner join with properties allows us to filter by state/city
      // We need to use a different approach since Supabase doesn't support
      // complex joins with filters in a single query easily
      
      // Instead, fetch violations and filter in memory for now
      // This is more accurate than trying to do a complex join
      const { data: violationsData, error } = await supabase
        .from("violations")
        .select("violation_type, property_id")
        .not("violation_type", "is", null);
      
      if (error) throw error;
      
      // If we have area filters, we need to get property IDs that match
      let validPropertyIds: Set<string> | null = null;
      
      if (selectedState || selectedCity) {
        let propQuery = supabase
          .from("properties")
          .select("id");
        
        if (selectedState) {
          propQuery = propQuery.ilike("state", selectedState);
        }
        if (selectedCity) {
          propQuery = propQuery.ilike("city", selectedCity);
        }
        
        const { data: propData, error: propError } = await propQuery;
        if (propError) throw propError;
        
        validPropertyIds = new Set(propData?.map(p => p.id) || []);
      }
      
      // Count violations, filtering by property IDs if we have area filters
      const counts = new Map<string, number>();
      violationsData?.forEach(v => {
        if (v.violation_type && VALID_SIGNAL_TYPES.includes(v.violation_type)) {
          // If we have property filters, check if this violation's property is in the set
          if (validPropertyIds !== null) {
            if (v.property_id && validPropertyIds.has(v.property_id)) {
              counts.set(v.violation_type, (counts.get(v.violation_type) || 0) + 1);
            }
          } else {
            // No area filter, count all
            counts.set(v.violation_type, (counts.get(v.violation_type) || 0) + 1);
          }
        }
      });
      
      // Sort by count descending
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  const hasAreaFilter = selectedState || selectedCity;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Active Enforcement Signals
        </Label>
        {/* Scope disclaimer */}
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Counts reflect violations within the selected enforcement area.
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
