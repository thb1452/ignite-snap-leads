import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { usePropertyContacts } from "@/hooks/usePropertyContacts";
import { SkipTraceChip } from "./SkipTraceChip";

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
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
}

export function MobilePropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick
}: MobilePropertyCardProps) {
  const { data: contacts = [] } = usePropertyContacts(property.id);
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
      {/* SnapScore Badge - Top Right */}
      <Badge
        className={`absolute top-3 right-3 ${getScoreColor(property.snap_score)} text-sm font-bold px-2.5 py-1`}
      >
        {property.snap_score || 0}
      </Badge>

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
          <h3 className="font-semibold text-base leading-snug text-foreground">
            {property.address}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {property.city}, {property.state} {property.zip}
          </p>

          {/* Skip Trace Status */}
          <div className="mt-2">
            <SkipTraceChip
              phoneCount={contacts.filter(c => c.phone).length}
              emailCount={contacts.filter(c => c.email).length}
            />
          </div>

          {/* AI Insight - Collapsible */}
          <div className="mt-3">
            <p className={`text-sm text-muted-foreground leading-relaxed ${!insightExpanded && shouldShowExpand ? 'line-clamp-2' : ''}`}>
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

          {/* Action Button - Large tap target */}
          <Button
            variant="default"
            size="sm"
            className="mt-3 h-11 min-h-[44px] gap-2 w-full sm:w-auto"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Implement text owner action
            }}
          >
            <MessageSquare className="h-4 w-4" />
            Text Owner
          </Button>
        </div>
      </div>
    </div>
  );
}
