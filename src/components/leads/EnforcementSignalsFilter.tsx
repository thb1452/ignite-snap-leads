import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Home, Lock } from "lucide-react";
import { VIOLATION_CATEGORIES } from "@/utils/violationCategoryMapper";
import { useSubscription } from "@/hooks/useSubscription";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface EnforcementSignalsFilterProps {
  selectedSignal: string | null;
  onSignalChange: (value: string | null) => void;
}

// Categories that require enterprise tier
const ENTERPRISE_ONLY_CATEGORIES = ['water_disconnection'];

export function EnforcementSignalsFilter({
  selectedSignal,
  onSignalChange,
}: EnforcementSignalsFilterProps) {
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isEnterprise = subscription?.plan_name === 'enterprise';

  const handleSignalChange = (value: string) => {
    if (value === "all") {
      onSignalChange(null);
      return;
    }

    // Check if this is an enterprise-only category
    if (ENTERPRISE_ONLY_CATEGORIES.includes(value) && !isEnterprise) {
      toast({
        title: "Enterprise Feature",
        description: "Water Disconnection data is available on the Enterprise plan. Upgrade to access properties with utility disconnections.",
        variant: "default",
      });
      navigate('/pricing');
      return;
    }

    onSignalChange(value);
  };

  const isLockedCategory = (categoryId: string) => {
    return ENTERPRISE_ONLY_CATEGORIES.includes(categoryId) && !isEnterprise;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Issue Type
        </Label>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Home className="h-3 w-3" />
          Properties with these issues
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">Category</Label>
        <Select
          value={selectedSignal || "all"}
          onValueChange={handleSignalChange}
        >
          <SelectTrigger className="w-full md:w-[240px] h-11 md:h-9">
            <SelectValue placeholder="All issues" />
          </SelectTrigger>
          <SelectContent className="z-[9999]">
            <SelectItem value="all">All issues</SelectItem>
            {VIOLATION_CATEGORIES.map(({ id, label }) => {
              const locked = isLockedCategory(id);
              return (
                <SelectItem
                  key={id}
                  value={id}
                  className={locked ? "text-muted-foreground" : ""}
                >
                  <span className="flex items-center gap-2">
                    {locked && <Lock className="h-3 w-3 text-amber-500" />}
                    {label}
                    {locked && <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">(Enterprise)</span>}
                  </span>
                </SelectItem>
              );
            })}
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
