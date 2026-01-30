import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Flame,
  MapPin,
  Home,
  Plus,
  Download,
  Eye,
  Clock,
} from "lucide-react";
import { differenceInDays } from "date-fns";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
}

interface EnhancedPropertyCardProps {
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
    enforcement_type?: string;
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
  onAddToList?: (id: string) => void;
  onExport?: (id: string) => void;
}

export function EnhancedPropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick,
  onAddToList,
  onExport,
}: EnhancedPropertyCardProps) {
  const [insightExpanded, setInsightExpanded] = useState(false);

  const getScoreVariant = (score: number | null) => {
    if (!score) return "outline";
    if (score >= 75) return "destructive";
    if (score >= 50) return "default";
    return "secondary";
  };

  const getScoreLabel = (score: number | null) => {
    if (!score) return "—";
    return score;
  };

  const getUpdatedText = (dateStr: string | null) => {
    if (!dateStr) return null;
    const daysDiff = differenceInDays(new Date(), new Date(dateStr));
    if (daysDiff === 0) return "Today";
    if (daysDiff === 1) return "Yesterday";
    if (daysDiff <= 7) return `${daysDiff} days ago`;
    if (daysDiff <= 30) return `${Math.floor(daysDiff / 7)} weeks ago`;
    return `${Math.floor(daysDiff / 30)} months ago`;
  };

  const updatedText = getUpdatedText(property.updated_at);
  const insightText = property.snap_insight || "No insight available";
  const shouldShowExpand = insightText.length > 120;
  const openCount = property.open_violations ?? 0;
  const violationTypes = property.violation_types ?? [];

  return (
    <Card
      className="group hover:shadow-md transition-all duration-200 cursor-pointer border-border/60 hover:border-border"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div
            className="pt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(property.id)}
              className="h-5 w-5"
            />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="flex items-center gap-2 font-semibold text-base leading-tight">
                  <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{formatAddress(property.address)}</span>
                </h3>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {formatCity(property.city)}, {property.state} {property.zip}
                  {updatedText && (
                    <>
                      <span className="mx-1.5">·</span>
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        Updated {updatedText}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Score badge */}
              <Badge
                variant={getScoreVariant(property.snap_score)}
                className="shrink-0 font-bold text-sm px-2.5 py-1"
              >
                {getScoreLabel(property.snap_score)}/100
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3 pt-0">
        {/* Violation summary row */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {openCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-semibold text-sm">{openCount} open</span>
            </div>
          )}

          {violationTypes.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {violationTypes.slice(0, 3).map((type) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {formatViolationType(type)}
                </Badge>
              ))}
              {violationTypes.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{violationTypes.length - 3} more
                </Badge>
              )}
            </div>
          )}

          {/* Water shutoff indicator */}
          {property.enforcement_type === "water_shutoff" && (
            <Badge
              variant="outline"
              className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200"
            >
              💧 Water Shutoff
            </Badge>
          )}
        </div>

        {/* AI Insight */}
        <p
          className={`text-sm text-muted-foreground leading-relaxed ${
            !insightExpanded && shouldShowExpand ? "line-clamp-2" : ""
          }`}
        >
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
      </CardContent>

      <CardFooter className="border-t pt-3 flex justify-between">
        <div className="flex gap-2">
          {onAddToList && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onAddToList(property.id);
              }}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add to List
            </Button>
          )}
          {onExport && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onExport(property.id);
              }}
              className="h-8 text-xs"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="h-8 text-xs"
        >
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
}
