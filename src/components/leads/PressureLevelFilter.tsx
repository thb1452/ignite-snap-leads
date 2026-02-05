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

  // Compact locked state for Starter users - uses popover instead of inline card
  if (!isProOrHigher) {
    return (
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          Pressure Level
          <Lock className="h-3.5 w-3.5 text-amber-500" />
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-fit gap-2 border-dashed border-amber-300 text-muted-foreground hover:border-amber-500"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Filter by enforcement pressure indicators
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Unlock Pressure Filters</p>
              <p className="text-xs text-muted-foreground">
                Find properties under the most enforcement pressure:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Open Violations Only</li>
                <li>Multiple Violations</li>
                <li>Repeat Offenders</li>
              </ul>
              <Button
                size="sm"
                className="w-full gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
                onClick={handleUpgrade}
              >
                <Lock className="h-3.5 w-3.5" />
                Upgrade to Professional
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Pressure Level
      </Label>
      
      <div className="flex items-center gap-4 flex-wrap">
        {/* Open Violations Only */}
        <div className="flex items-center gap-2">
          <Switch
            id="open-only"
            checked={openViolationsOnly}
            onCheckedChange={onOpenViolationsChange}
          />
          <Label htmlFor="open-only" className="text-sm cursor-pointer">
            Open Only
          </Label>
        </div>

        {/* Multiple Violations */}
        <div className="flex items-center gap-2">
          <Switch
            id="multiple"
            checked={multipleViolationsOnly}
            onCheckedChange={onMultipleViolationsChange}
          />
          <Label htmlFor="multiple" className="text-sm cursor-pointer">
            Multiple
          </Label>
        </div>

        {/* Repeat Offender */}
        <div className="flex items-center gap-2">
          <Switch
            id="repeat"
            checked={repeatOffenderOnly}
            onCheckedChange={onRepeatOffenderChange}
          />
          <Label htmlFor="repeat" className="text-sm cursor-pointer">
            Repeat
          </Label>
        </div>
      </div>
    </div>
  );
}
