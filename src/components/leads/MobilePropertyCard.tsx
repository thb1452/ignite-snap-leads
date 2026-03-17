import { useState, memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, AlertTriangle, Flame } from "lucide-react";
import { SaveHeartButton } from "./SaveHeartButton";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
}

interface MobilePropertyCardProps {
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    snap_score: number | null;
    snap_insight: string | null;
    updated_at: string | null;
    violations?: Violation[];
    total_violations?: number | null;
    open_violations?: number | null;
    violation_types?: string[] | null;
    enforcement_type?: string; // 'code_violation' or 'water_shutoff'
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
  isSaved?: boolean;
  onToggleSaved?: (id: string) => void;
}

export const MobilePropertyCard = memo(function MobilePropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick,
  isSaved = false,
  onToggleSaved,
}: MobilePropertyCardProps) {
  const [insightExpanded, setInsightExpanded] = useState(false);
  
  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 75) return "bg-red-500 text-white";
    if (score >= 50) return "bg-orange-500 text-white";
    if (score >= 25) return "bg-yellow-500 text-black";
    return "bg-blue-500 text-white";
  };

  const insightText = property.snap_insight || "No insight available";
  const shouldShowExpand = insightText.length > 100;

  return (
    <div
      className="relative bg-background border-b p-4 active:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      {/* Badges - Top Right */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {/* Save heart */}
        {onToggleSaved && (
          <SaveHeartButton
            isSaved={isSaved}
            onToggle={() => onToggleSaved(property.id)}
            size="md"
          />
        )}
        {/* Water shutoff indicator */}
        {property.enforcement_type === 'water_shutoff' && (
          <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200 px-1.5 py-0.5">
            💧
          </Badge>
        )}
        {/* SnapScore Badge */}
        <Badge
          className={`snap-score-value ${getScoreColor(property.snap_score)} text-sm font-bold px-2.5 py-1`}
        >
          {property.snap_score || 0}
        </Badge>
      </div>

      <div className="flex items-start gap-3 pr-14">
        {/* Checkbox - Large tap target */}
        <div 
          className="pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(property.id)}
            className="h-6 w-6"
          />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Address - Full width, no truncation */}
          <h3 className="property-address font-semibold text-base leading-snug text-foreground">
            {formatAddress(property.address)}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatCity(property.city)}, {property.state} {property.zip}
          </p>

          {/* Violation Density Indicators */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* Only show if there are actual violations (total > 0) */}
            {(property.total_violations != null && property.total_violations > 0) && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className={`h-3.5 w-3.5 ${(property.open_violations ?? 0) > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                <Badge 
                  variant="outline" 
                  className={`text-xs ${
                    (property.open_violations ?? 0) > 0 
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                      : 'bg-rose-100 text-rose-700 border-rose-200'
                  }`}
                >
                  {(property.open_violations ?? 0) > 0 ? 'open' : 'closed'}
                </Badge>
              </div>
            )}
            {property.enforcement_type === 'water_shutoff' ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-cyan-700 font-medium">Water Disconnection</span>
              </div>
            ) : property.violation_types && property.violation_types.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs text-muted-foreground">
                  {property.violation_types.filter(v => v !== 'Unknown').slice(0, 2).map(formatViolationType).join(", ") || "Code Violation"}
                  {property.violation_types.filter(v => v !== 'Unknown').length > 2 && ` +${property.violation_types.filter(v => v !== 'Unknown').length - 2}`}
                </span>
              </div>
            )}
          </div>

          {/* AI Insight - Collapsible */}
          <div className="mt-3">
            <p className={`snap-insight-text text-sm text-muted-foreground leading-relaxed ${!insightExpanded && shouldShowExpand ? 'line-clamp-2' : ''}`}>
              {insightText}
            </p>
            {shouldShowExpand && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setInsightExpanded(!insightExpanded);
                }}
                className="h-auto p-0 mt-1 text-xs text-primary hover:bg-transparent"
              >
                {insightExpanded ? (
                  <>Show less <ChevronUp className="h-3 w-3 ml-1" /></>
                ) : (
                  <>Read more <ChevronDown className="h-3 w-3 ml-1" /></>
                )}
              </Button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
});
