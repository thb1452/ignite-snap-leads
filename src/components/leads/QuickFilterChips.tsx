import { Button } from "@/components/ui/button";
import { Flame, Building2, Zap, TrendingUp, Clock, Award } from "lucide-react";

interface QuickFilterChipsProps {
  selectedSignal: string | null;
  onSignalChange: (signal: string | null) => void;
  openViolationsOnly: boolean;
  onOpenViolationsChange: (value: boolean) => void;
  multipleViolationsOnly: boolean;
  onMultipleViolationsChange: (value: boolean) => void;
}

const QUICK_FILTERS = [
  { id: "fire", label: "Fire Hazards", icon: Flame, color: "text-orange-600" },
  { id: "structural", label: "Structural", icon: Building2, color: "text-amber-700" },
  { id: "electrical", label: "Electrical", icon: Zap, color: "text-yellow-600" },
] as const;

export function QuickFilterChips({
  selectedSignal,
  onSignalChange,
  openViolationsOnly,
  onOpenViolationsChange,
  multipleViolationsOnly,
  onMultipleViolationsChange,
}: QuickFilterChipsProps) {
  const handleSignalClick = (signalId: string) => {
    if (selectedSignal === signalId) {
      onSignalChange(null);
    } else {
      onSignalChange(signalId);
    }
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {QUICK_FILTERS.map((filter) => {
        const Icon = filter.icon;
        const isActive = selectedSignal === filter.id;
        return (
          <Button
            key={filter.id}
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => handleSignalClick(filter.id)}
            className={`shrink-0 gap-1.5 ${isActive ? "" : "hover:bg-accent"}`}
          >
            <Icon className={`h-3.5 w-3.5 ${isActive ? "" : filter.color}`} />
            {filter.label}
          </Button>
        );
      })}

      <Button
        variant={openViolationsOnly ? "default" : "outline"}
        size="sm"
        onClick={() => onOpenViolationsChange(!openViolationsOnly)}
        className="shrink-0 gap-1.5"
      >
        <TrendingUp className={`h-3.5 w-3.5 ${openViolationsOnly ? "" : "text-green-600"}`} />
        Open Only
      </Button>

      <Button
        variant={multipleViolationsOnly ? "default" : "outline"}
        size="sm"
        onClick={() => onMultipleViolationsChange(!multipleViolationsOnly)}
        className="shrink-0 gap-1.5"
      >
        <Clock className={`h-3.5 w-3.5 ${multipleViolationsOnly ? "" : "text-blue-600"}`} />
        Multiple
      </Button>
    </div>
  );
}
