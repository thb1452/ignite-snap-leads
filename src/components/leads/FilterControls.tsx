import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface FilterControlsProps {
  snapScoreMin: number;
  onSnapScoreChange: (value: number) => void;
  lastSeenDays: number | null;
  onLastSeenChange: (value: number | null) => void;
  selectedSource: string | null;
  onSourceChange: (value: string | null) => void;
}

export function FilterControls({
  snapScoreMin,
  onSnapScoreChange,
  lastSeenDays,
  onLastSeenChange,
  selectedSource,
  onSourceChange,
}: FilterControlsProps) {
  return (
    <div className="flex items-center gap-4 p-4 border-b bg-background">
      {/* Score Slider */}
      <div className="flex items-center gap-3 min-w-[200px]">
        <Label className="text-sm font-medium whitespace-nowrap">
          Score ≥ {snapScoreMin}
        </Label>
        <Slider
          value={[snapScoreMin]}
          onValueChange={([value]) => onSnapScoreChange(value)}
          max={100}
          step={5}
          className="flex-1"
        />
      </div>

      {/* Last Seen Dropdown */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Last seen</Label>
        <Select
          value={lastSeenDays?.toString() || "all"}
          onValueChange={(value) => onLastSeenChange(value === "all" ? null : parseInt(value))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7">≤ 7 days</SelectItem>
            <SelectItem value="30">≤ 30 days</SelectItem>
            <SelectItem value="90">≤ 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Source Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Source</Label>
        <Select
          value={selectedSource || "all"}
          onValueChange={(value) => onSourceChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="code_violations">Code Violations</SelectItem>
            <SelectItem value="fsbo">FSBO</SelectItem>
            <SelectItem value="tax_delinquent">Tax Delinquent</SelectItem>
            <SelectItem value="pre_foreclosure">Pre-Foreclosure</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
