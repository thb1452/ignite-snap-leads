import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Lock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

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

  const handleLockedClick = () => {
    toast({
      title: "Professional Feature",
      description: "Pressure Level filters help you find the most motivated sellers. Upgrade to Professional to unlock.",
      variant: "default",
    });
    navigate('/pricing');
  };

  // Locked state for Starter users
  if (!isProOrHigher) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            Pressure Level
            <Lock className="h-3.5 w-3.5 text-amber-500" />
          </Label>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Filter by enforcement pressure indicators
          </p>
        </div>
        
        <div className="bg-muted/50 border border-dashed border-amber-300 dark:border-amber-700 rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Unlock powerful filters to find properties under the most enforcement pressure:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li>Open Violations Only</li>
              <li>Multiple Violations</li>
              <li>Repeat Offenders</li>
            </ul>
            <Button
              size="sm"
              className="mt-2 w-fit gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
              onClick={handleLockedClick}
            >
              <Lock className="h-3.5 w-3.5" />
              Upgrade to Professional
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
