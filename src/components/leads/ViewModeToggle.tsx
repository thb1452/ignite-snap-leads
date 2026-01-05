import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Building2, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type ViewMode = 'property' | 'violation';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase">View</span>
        <ToggleGroup
          type="single"
          value={value}
          onValueChange={(v) => v && onChange(v as ViewMode)}
          className="bg-muted rounded-lg p-0.5"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="property"
                size="sm"
                className="h-7 px-2 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                <Building2 className="h-3.5 w-3.5 mr-1" />
                <span className="text-xs">Properties</span>
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">One row per property (default)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="violation"
                size="sm"
                className="h-7 px-2 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                <span className="text-xs">Violations</span>
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">One row per violation (for audits & exports)</p>
            </TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>
    </TooltipProvider>
  );
}
