import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Lock, Target } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface SnapScoreFilterProps {
  snapScoreRange: [number, number];
  onSnapScoreChange: (value: [number, number]) => void;
}

export function SnapScoreFilter({
  snapScoreRange,
  onSnapScoreChange,
}: SnapScoreFilterProps) {
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const isEnterprise = subscription?.plan_name === 'enterprise';

  const handleLockedClick = () => {
    toast({
      title: "Enterprise Feature",
      description: "SnapScore filtering helps you prioritize properties by enforcement pressure. Upgrade to Enterprise to unlock.",
      variant: "default",
    });
    navigate('/pricing');
  };

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-red-500";
    if (score >= 50) return "text-orange-500";
    if (score >= 25) return "text-yellow-500";
    return "text-blue-500";
  };

  // Locked state for non-Enterprise users
  if (!isEnterprise) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            SnapScore Range
            <Lock className="h-3.5 w-3.5 text-amber-500" />
          </Label>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3" />
            Filter by enforcement pressure score
          </p>
        </div>
        
        <div className="bg-muted/50 border border-dashed border-amber-300 dark:border-amber-700 rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Target properties by enforcement pressure:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
              <li><span className="text-red-500 font-medium">75-100</span> — Critical (highest pressure)</li>
              <li><span className="text-orange-500 font-medium">50-74</span> — High pressure</li>
              <li><span className="text-yellow-500 font-medium">25-49</span> — Moderate</li>
              <li><span className="text-blue-500 font-medium">0-24</span> — Low pressure</li>
            </ul>
            <Button
              size="sm"
              className="mt-2 w-fit gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
              onClick={handleLockedClick}
            >
              <Lock className="h-3.5 w-3.5" />
              Upgrade to Enterprise
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
          SnapScore Range
        </Label>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Target className="h-3 w-3" />
          Filter by enforcement pressure score (0-100)
        </p>
      </div>
      
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className={`font-medium ${getScoreColor(snapScoreRange[0])}`}>
            {snapScoreRange[0]}
          </span>
          <span className="text-muted-foreground">to</span>
          <span className={`font-medium ${getScoreColor(snapScoreRange[1])}`}>
            {snapScoreRange[1]}
          </span>
        </div>
        
        <Slider
          value={snapScoreRange}
          onValueChange={(value) => onSnapScoreChange(value as [number, number])}
          min={0}
          max={100}
          step={5}
          className="w-full"
        />
        
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="text-blue-500">Low</span>
          <span className="text-yellow-500">Moderate</span>
          <span className="text-orange-500">High</span>
          <span className="text-red-500">Critical</span>
        </div>
        
        {/* Quick presets */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSnapScoreChange([0, 100])}
            className={snapScoreRange[0] === 0 && snapScoreRange[1] === 100 ? "border-primary" : ""}
          >
            All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSnapScoreChange([75, 100])}
            className={snapScoreRange[0] === 75 && snapScoreRange[1] === 100 ? "border-red-500 text-red-500" : ""}
          >
            Critical (75+)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSnapScoreChange([50, 100])}
            className={snapScoreRange[0] === 50 && snapScoreRange[1] === 100 ? "border-orange-500 text-orange-500" : ""}
          >
            High+ (50+)
          </Button>
        </div>
      </div>
    </div>
  );
}
