import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface PressureLevelFilterProps {
  openViolationsOnly: boolean;
  onOpenViolationsChange: (value: boolean) => void;
  multipleViolationsOnly: boolean;
  onMultipleViolationsChange: (value: boolean) => void;
  repeatOffenderOnly: boolean;
  onRepeatOffenderChange: (value: boolean) => void;
}

export function PressureLevelFilter({
  openViolationsOnly,
  onOpenViolationsChange,
  multipleViolationsOnly,
  onMultipleViolationsChange,
  repeatOffenderOnly,
  onRepeatOffenderChange,
}: PressureLevelFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Switch id="open-only" checked={openViolationsOnly} onCheckedChange={onOpenViolationsChange} className="scale-75" />
        <Label htmlFor="open-only" className="text-xs cursor-pointer">Open</Label>
      </div>
      <div className="flex items-center gap-1">
        <Switch id="multiple" checked={multipleViolationsOnly} onCheckedChange={onMultipleViolationsChange} className="scale-75" />
        <Label htmlFor="multiple" className="text-xs cursor-pointer">Multi</Label>
      </div>
      <div className="flex items-center gap-1">
        <Switch id="repeat" checked={repeatOffenderOnly} onCheckedChange={onRepeatOffenderChange} className="scale-75" />
        <Label htmlFor="repeat" className="text-xs cursor-pointer">Repeat</Label>
      </div>
    </div>
  );
}
