import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertCircle } from "lucide-react";

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Pressure Level
        </Label>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Filter by enforcement pressure indicators.
        </p>
      </div>
      
      <div className="flex flex-col gap-4">
        {/* Open Violations Only */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Label className="text-sm font-medium">Open Violations Only</Label>
            <span className="text-xs text-muted-foreground">
              Show only properties with unresolved violations
            </span>
          </div>
          <Switch
            checked={openViolationsOnly}
            onCheckedChange={onOpenViolationsChange}
          />
        </div>

        {/* Multiple Violations */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Label className="text-sm font-medium">Multiple Violations</Label>
            <span className="text-xs text-muted-foreground">
              Properties with more than one violation
            </span>
          </div>
          <Switch
            checked={multipleViolationsOnly}
            onCheckedChange={onMultipleViolationsChange}
          />
        </div>

        {/* Repeat Offender */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Label className="text-sm font-medium">Repeat Offender</Label>
            <span className="text-xs text-muted-foreground">
              Same property, multiple enforcement cases
            </span>
          </div>
          <Switch
            checked={repeatOffenderOnly}
            onCheckedChange={onRepeatOffenderChange}
          />
        </div>
      </div>
    </div>
  );
}
