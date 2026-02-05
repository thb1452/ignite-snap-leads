import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Lock, Target } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  
  const isEnterprise = subscription?.plan_name === 'enterprise';

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-red-500";
    if (score >= 50) return "text-orange-500";
    if (score >= 25) return "text-yellow-500";
    return "text-blue-500";
  };

  // Compact locked state for non-Enterprise users - inline badge style
  if (!isEnterprise) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Lock className="h-3 w-3 text-amber-500" />
            SnapScore
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Unlock SnapScore Filtering</p>
            <p className="text-xs text-muted-foreground">
              Target properties by enforcement pressure:
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5 ml-3 list-disc">
              <li><span className="text-red-500 font-medium">75-100</span> — Critical</li>
              <li><span className="text-orange-500 font-medium">50-74</span> — High</li>
              <li><span className="text-yellow-500 font-medium">25-49</span> — Moderate</li>
              <li><span className="text-blue-500 font-medium">0-24</span> — Low</li>
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
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Score
      </span>
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`font-medium ${getScoreColor(snapScoreRange[0])}`}>
          {snapScoreRange[0]}
        </span>
        <span className="text-muted-foreground">-</span>
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
        className="w-24"
      />
      <div className="flex gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSnapScoreChange([0, 100])}
          className={`h-6 px-1.5 text-xs ${snapScoreRange[0] === 0 && snapScoreRange[1] === 100 ? "bg-muted" : ""}`}
        >
          All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSnapScoreChange([75, 100])}
          className={`h-6 px-1.5 text-xs ${snapScoreRange[0] === 75 ? "bg-red-50 text-red-600" : ""}`}
        >
          Crit
        </Button>
      </div>
    </div>
  );
}
