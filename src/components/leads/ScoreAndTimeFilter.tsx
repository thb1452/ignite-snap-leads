import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface ScoreAndTimeFilterProps {
  snapScoreMin: number;
  onSnapScoreChange: (value: number) => void;
  lastSeenDays: number | null;
  onLastSeenChange: (value: number | null) => void;
}

export function ScoreAndTimeFilter({
  snapScoreMin,
  onSnapScoreChange,
  lastSeenDays,
  onLastSeenChange,
}: ScoreAndTimeFilterProps) {
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
    </div>
  );
}
