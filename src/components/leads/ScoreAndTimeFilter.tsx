import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface TimeFilterProps {
  lastSeenDays: number | null;
  onLastSeenChange: (value: number | null) => void;
}

export function TimeFilter({
  lastSeenDays,
  onLastSeenChange,
}: TimeFilterProps) {
  return (
    <Select
      value={lastSeenDays?.toString() || "all"}
      onValueChange={(value) => onLastSeenChange(value === "all" ? null : parseInt(value))}
    >
      <SelectTrigger className="w-[90px] h-7 text-xs">
        <SelectValue placeholder="Time" />
      </SelectTrigger>
      <SelectContent className="z-[9999]">
        <SelectItem value="all">All time</SelectItem>
        <SelectItem value="7">≤ 7 days</SelectItem>
        <SelectItem value="30">≤ 30 days</SelectItem>
        <SelectItem value="90">≤ 90 days</SelectItem>
      </SelectContent>
    </Select>
  );
}
