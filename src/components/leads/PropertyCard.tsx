import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { PropertyContactChips } from "./PropertyContactChips";
import { usePropertyContacts } from "@/hooks/usePropertyContacts";
import { SkipTraceChip } from "./SkipTraceChip";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
}

interface PropertyCardProps {
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    snap_score: number | null;
    snap_insight: string | null;
    updated_at: string | null;
    violations?: Violation[];
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
}

export function PropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick
}: PropertyCardProps) {
  const { data: contacts = [] } = usePropertyContacts(property.id);
  const [insightExpanded, setInsightExpanded] = useState(false);
  
  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 80) return "bg-destructive";
    if (score >= 60) return "bg-orange-500";
    return "bg-primary";
  };

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes("pending summons") || statusLower.includes("repeat violation") || statusLower.includes("abate")) {
      return "bg-destructive/90 text-destructive-foreground";
    }
    if (statusLower.includes("notice sent") || statusLower.includes("abatement pending") || statusLower.includes("pending")) {
      return "bg-yellow-500/90 text-white";
    }
    if (statusLower.includes("voluntary compliance") || statusLower.includes("closed")) {
      return "bg-green-500/90 text-white";
    }
    return "bg-muted text-muted-foreground";
  };

  const lastSeen = property.updated_at
    ? formatDistanceToNow(new Date(property.updated_at), { addSuffix: false })
    : "Unknown";

  const hasPhone = contacts.some(c => c.phone);
  const hasEmail = contacts.some(c => c.email);
  
  const mostRecentViolation = property.violations?.[0];
  const insightText = property.snap_insight || "No insight available";
  const shouldShowExpand = insightText.length > 150;

  return (
    <div
      className="group p-4 border-b hover:bg-accent/50 transition-colors cursor-pointer bg-background"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(property.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 shrink-0"
        />
        
        <div className="flex-1 min-w-0 max-w-full">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base truncate">
                {property.address}
              </h3>
              <p className="text-xs text-muted-foreground">
                {property.city}, {property.state}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SkipTraceChip
                phoneCount={contacts.filter(c => c.phone).length}
                emailCount={contacts.filter(c => c.email).length}
              />
              <Badge
                className={`${getScoreColor(property.snap_score)} text-white`}
              >
                {property.snap_score || 0}
              </Badge>
            </div>
          </div>

          {/* Violation Details */}
          {mostRecentViolation && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">
                {mostRecentViolation.violation_type || "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <Badge 
                variant="outline" 
                className={`text-xs ${getStatusColor(mostRecentViolation.status)}`}
              >
                {mostRecentViolation.status}
              </Badge>
              {mostRecentViolation.opened_date && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(mostRecentViolation.opened_date), "MMM d, yyyy")}
                  </span>
                </>
              )}
            </div>
          )}

          {/* AI Insight */}
          <div className="mb-3">
            <p className={`text-sm text-muted-foreground leading-relaxed ${!insightExpanded && shouldShowExpand ? 'line-clamp-3' : ''}`}>
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
                  <>
                    Show less <ChevronUp className="h-3 w-3 ml-1" />
                  </>
                ) : (
                  <>
                    Read more <ChevronDown className="h-3 w-3 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-primary -ml-2"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Implement text owner action
              }}
            >
              <MessageSquare className="h-4 w-4" />
              Text owner
            </Button>

            <span className="text-xs text-muted-foreground">
              {lastSeen}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
