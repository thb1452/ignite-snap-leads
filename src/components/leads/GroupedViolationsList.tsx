import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { getViolationStatusStyle } from "@/utils/violationStatusStyles";
import { formatViolationType } from "@/utils/formatViolationType";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
}

interface GroupedViolation {
  type: string;
  displayName: string;
  count: number;
  violations: Violation[];
  newestDate: string | null;
  maxDaysOpen: number;
  statuses: string[];
}

interface GroupedViolationsListProps {
  violations: Violation[];
  maxInitialGroups?: number;
  onViewAll?: () => void;
  onExport?: () => void;
}

const VIOLATION_ICONS: Record<string, string> = {
  fire: "🔥",
  fire_safety: "🔥",
  structural: "🏚️",
  electrical: "⚡",
  receptacles: "🔌",
  plumbing: "🚿",
  hvac: "❄️",
  exterior: "🏠",
  interior: "🪟",
  zoning: "📋",
  health: "🏥",
  safety: "⚠️",
  default: "📋",
};

function getViolationIcon(type: string): string {
  const lowerType = type.toLowerCase();
  for (const [key, icon] of Object.entries(VIOLATION_ICONS)) {
    if (lowerType.includes(key)) return icon;
  }
  return VIOLATION_ICONS.default;
}

export function GroupedViolationsList({
  violations,
  maxInitialGroups = 4,
  onViewAll,
  onExport,
}: GroupedViolationsListProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const groupedViolations = useMemo(() => {
    const groups: Record<string, GroupedViolation> = {};

    violations.forEach((v) => {
      const type = v.violation_type || "Unknown";
      if (!groups[type]) {
        groups[type] = {
          type,
          displayName: formatViolationType(type),
          count: 0,
          violations: [],
          newestDate: null,
          maxDaysOpen: 0,
          statuses: [],
        };
      }

      groups[type].count++;
      groups[type].violations.push(v);
      
      if (v.opened_date) {
        if (!groups[type].newestDate || v.opened_date > groups[type].newestDate) {
          groups[type].newestDate = v.opened_date;
        }
      }
      
      if (v.days_open && v.days_open > groups[type].maxDaysOpen) {
        groups[type].maxDaysOpen = v.days_open;
      }
      
      if (v.status && !groups[type].statuses.includes(v.status)) {
        groups[type].statuses.push(v.status);
      }
    });

    // Sort by count descending
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [violations]);

  const displayedGroups = showAll
    ? groupedViolations
    : groupedViolations.slice(0, maxInitialGroups);

  const remainingCount = groupedViolations.length - maxInitialGroups;
  const totalRemaining = groupedViolations
    .slice(maxInitialGroups)
    .reduce((sum, g) => sum + g.count, 0);

  const toggleGroup = (type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM d, yyyy");
  };

  if (violations.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">No violations recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayedGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.type);
        const icon = getViolationIcon(group.type);
        const hasOpenViolations = group.statuses.some(
          (s) => s.toLowerCase().includes("open") || s.toLowerCase() === "active"
        );

        return (
          <div
            key={group.type}
            className="rounded-xl border bg-card overflow-hidden"
          >
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.type)}
              className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="font-medium text-foreground">
                  {group.displayName}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {group.count}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {hasOpenViolations && (
                  <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                    Open
                  </Badge>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Group Summary (always visible) */}
            {!isExpanded && (
              <div className="px-3 pb-3 pt-0">
                <p className="text-xs text-muted-foreground">
                  Opened {formatDate(group.newestDate)} • {group.maxDaysOpen} days open
                </p>
              </div>
            )}

            {/* Expanded Violations */}
            {isExpanded && (
              <div className="border-t">
                {group.violations.slice(0, 5).map((v) => {
                  const statusStyle = getViolationStatusStyle(v.status);
                  return (
                    <div
                      key={v.id}
                      className="px-3 py-2 border-b last:border-b-0 bg-muted/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground">
                          {v.case_id ? `Case ${v.case_id}` : "Violation"}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusStyle.badge}`}
                        >
                          {v.status || "Unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Opened {formatDate(v.opened_date)} • {v.days_open ?? 0} days open
                      </p>
                    </div>
                  );
                })}
                {group.violations.length > 5 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center bg-muted/30">
                    +{group.violations.length - 5} more
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Show More / Actions */}
      {(remainingCount > 0 || onViewAll || onExport) && (
        <div className="pt-2 space-y-2">
          {remainingCount > 0 && !showAll && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              <FileText className="h-4 w-4 mr-2" />
              +{totalRemaining} more violations in {remainingCount} categories
            </Button>
          )}
          
          <div className="flex gap-2">
            {onViewAll && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onViewAll}
              >
                <FileText className="h-4 w-4 mr-2" />
                View All
              </Button>
            )}
            {onExport && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onExport}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
