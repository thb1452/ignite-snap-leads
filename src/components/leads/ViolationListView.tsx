import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { getViolationStatusStyle } from "@/utils/violationStatusStyles";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  property_id: string;
  case_id?: string | null;
  description?: string | null;
}

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
}

interface ViolationWithProperty extends Violation {
  property: Property;
}

interface ViolationListViewProps {
  violations: ViolationWithProperty[];
  onPropertyClick: (propertyId: string) => void;
}

export function ViolationListView({
  violations,
  onPropertyClick,
}: ViolationListViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: violations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-500";
    if (score >= 25) return "bg-yellow-500";
    return "bg-blue-500";
  };

  // Group violations by property for visual grouping
  let currentPropertyId: string | null = null;

  return (
    <div ref={parentRef} className="h-[calc(100vh-240px)] overflow-y-auto pb-20">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const violation = violations[virtualItem.index];
          const isNewProperty = violation.property_id !== currentPropertyId;
          currentPropertyId = violation.property_id;

          const statusStyle = getViolationStatusStyle(violation.status);

          return (
            <div
              key={violation.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div
                className={`p-3 border-b hover:bg-accent/50 transition-colors cursor-pointer ${
                  isNewProperty ? "border-t-2 border-t-border" : ""
                }`}
                onClick={() => onPropertyClick(violation.property_id)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Property header (show for first violation of each property) */}
                    {isNewProperty && (
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          className={`${getScoreColor(violation.property.snap_score)} text-white text-xs`}
                        >
                          {violation.property.snap_score || 0}
                        </Badge>
                        <span className="font-medium text-sm truncate">
                          {violation.property.address}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {violation.property.city}, {violation.property.state}
                        </span>
                      </div>
                    )}

                    {/* Violation details */}
                    <div className="flex items-center gap-2 flex-wrap pl-1">
                      <span className="text-sm font-medium">
                        {violation.violation_type}
                      </span>
                      <Badge variant="outline" className={`text-xs ${statusStyle.badge}`}>
                        {violation.status}
                      </Badge>
                      {violation.case_id && (
                        <span className="text-xs text-muted-foreground">
                          Case: {violation.case_id}
                        </span>
                      )}
                      {violation.opened_date && (
                        <span className="text-xs text-muted-foreground">
                          Opened: {format(new Date(violation.opened_date), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>

                    {/* Violation description */}
                    {violation.description && (
                      <p className="text-xs text-muted-foreground mt-1 pl-1 line-clamp-2">
                        {violation.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
