import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Home, Lock } from "lucide-react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface EnforcementSignalsFilterProps {
  selectedSignal: string | null;
  onSignalChange: (value: string | null) => void;
  selectedState: string | null;
  selectedCity: string | null;
}

// Categories that require enterprise tier
const ENTERPRISE_ONLY_CATEGORIES = ['water_disconnection'];

const SIGNAL_CATEGORIES = [
  { categoryId: 'exterior', label: 'Exterior Issues' },
  { categoryId: 'safety', label: 'Safety Issues' },
  { categoryId: 'structural', label: 'Structural Issues' },
  { categoryId: 'zoning', label: 'Zoning Issues' },
  { categoryId: 'vacancy', label: 'Vacancy Issues' },
  { categoryId: 'utility', label: 'Utility Issues' },
  { categoryId: 'water_disconnection', label: 'Water Disconnection' },
] as const;

export function EnforcementSignalsFilter({
  selectedSignal,
  onSignalChange,
  selectedState: _selectedState,
  selectedCity: _selectedCity,
}: EnforcementSignalsFilterProps) {
  const { hasFeature } = useFeatureAccess();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const hasEscalationAlerts = isAdmin || hasFeature('escalation_alerts');

  const handleSignalChange = (value: string) => {
    if (value === "all") {
      onSignalChange(null);
      return;
    }
    
    // Check if this is an enterprise-only category
    if (ENTERPRISE_ONLY_CATEGORIES.includes(value) && !hasEscalationAlerts) {
      toast({
        title: "Elite Feature",
        description: "Water Disconnection data is available on the Elite plan. Upgrade to access properties with utility disconnections.",
        variant: "default",
      });
      navigate('/pricing');
      return;
    }
    
    onSignalChange(value);
  };

  const isLockedCategory = (categoryId: string) => {
    return ENTERPRISE_ONLY_CATEGORIES.includes(categoryId) && !hasEscalationAlerts;
  };

  return (
    <Select
      value={selectedSignal || "all"}
      onValueChange={handleSignalChange}
    >
      <SelectTrigger className="w-[120px] h-7 text-xs">
        <SelectValue placeholder="Issue" />
      </SelectTrigger>
      <SelectContent className="z-[9999]">
        <SelectItem value="all">All issues</SelectItem>
        {SIGNAL_CATEGORIES.map(({ categoryId, label }) => {
          const locked = isLockedCategory(categoryId);
          return (
            <SelectItem 
              key={categoryId} 
              value={categoryId}
              className={locked ? "text-muted-foreground" : ""}
            >
              <span className="flex items-center gap-1">
                {locked && <Lock className="h-3 w-3" />}
                {label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
