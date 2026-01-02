import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FilterControlsProps {
  snapScoreMin: number;
  onSnapScoreChange: (value: number) => void;
  lastSeenDays: number | null;
  onLastSeenChange: (value: number | null) => void;
  selectedSource: string | null;
  onSourceChange: (value: string | null) => void;
}

// Only show clean, categorized violation types
const VALID_VIOLATION_TYPES = [
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

export function FilterControls({
  snapScoreMin,
  onSnapScoreChange,
  lastSeenDays,
  onLastSeenChange,
  selectedSource,
  onSourceChange,
}: FilterControlsProps) {
  // Fetch actual violation types from database
  const { data: violationTypes = [] } = useQuery({
    queryKey: ["violation-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("violations")
        .select("violation_type")
        .not("violation_type", "is", null)
        .limit(10000);
      
      if (error) throw error;
      
      // Count and dedupe
      const counts = new Map<string, number>();
      data?.forEach(v => {
        if (v.violation_type && VALID_VIOLATION_TYPES.includes(v.violation_type)) {
          counts.set(v.violation_type, (counts.get(v.violation_type) || 0) + 1);
        }
      });
      
      // Sort by count descending
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));
    },
    staleTime: 60000, // Cache for 1 minute
  });

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-4 flex-wrap">
      {/* Score Slider */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:min-w-[200px]">
        <Label className="text-sm font-medium whitespace-nowrap">
          Score ≥ {snapScoreMin}
        </Label>
        <Slider
          value={[snapScoreMin]}
          onValueChange={([value]) => onSnapScoreChange(value)}
          max={100}
          step={5}
          className="flex-1 min-w-[150px]"
        />
      </div>

      {/* Last Seen Dropdown */}
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Last seen</Label>
        <Select
          value={lastSeenDays?.toString() || "all"}
          onValueChange={(value) => onLastSeenChange(value === "all" ? null : parseInt(value))}
        >
          <SelectTrigger className="w-full md:w-[140px] h-11 md:h-9">
            <SelectValue placeholder="All time" />
          </SelectTrigger>
          <SelectContent className="z-[9999]">
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7">≤ 7 days</SelectItem>
            <SelectItem value="30">≤ 30 days</SelectItem>
            <SelectItem value="90">≤ 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Violation Type Filter */}
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Violation Type</Label>
        <Select
          value={selectedSource || "all"}
          onValueChange={(value) => onSourceChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-full md:w-[180px] h-11 md:h-9">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent className="z-[9999]">
            <SelectItem value="all">All types</SelectItem>
            {violationTypes.map(({ type, count }) => (
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
