import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Lock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const planName = subscription?.plan_name;
  const isProOrHigher = planName === 'professional' || planName === 'enterprise';

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  // Compact locked state for Starter users - inline badge style
  if (!isProOrHigher) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Lock className="h-3 w-3 text-amber-500" />
            Pressure
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Unlock Pressure Filters</p>
            <p className="text-xs text-muted-foreground">
              Find properties under enforcement pressure:
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 ml-3 list-disc">
              <li>Open Violations Only</li>
              <li>Multiple Violations</li>
              <li>Repeat Offenders</li>
            </ul>
            <Button
              size="sm"
              className="w-full gap-1.5 text-xs bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
              onClick={handleUpgrade}
            >
              <Lock className="h-3 w-3" />
              Upgrade
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Pressure
      </span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Switch
            id="open-only"
            checked={openViolationsOnly}
            onCheckedChange={onOpenViolationsChange}
            className="scale-75"
          />
          <Label htmlFor="open-only" className="text-xs cursor-pointer">
            Open
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            id="multiple"
            checked={multipleViolationsOnly}
            onCheckedChange={onMultipleViolationsChange}
            className="scale-75"
          />
          <Label htmlFor="multiple" className="text-xs cursor-pointer">
            Multi
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            id="repeat"
            checked={repeatOffenderOnly}
            onCheckedChange={onRepeatOffenderChange}
            className="scale-75"
          />
          <Label htmlFor="repeat" className="text-xs cursor-pointer">
            Repeat
          </Label>
        </div>
      </div>
    </div>
  );
}
