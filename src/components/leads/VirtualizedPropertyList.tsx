import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CompactPropertyRow } from "./CompactPropertyRow";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
}

interface Property {
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
}

interface VirtualizedPropertyListProps {
  properties: Property[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onPropertyClick: (id: string) => void;
}

// Compact row height for dense list (shows 10-15 items in viewport)
const COMPACT_ROW_HEIGHT = 52;

export function VirtualizedPropertyList({
  properties,
  selectedIds,
  onToggleSelect,
  onPropertyClick,
}: VirtualizedPropertyListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: properties.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => COMPACT_ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      {/* Column Headers */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-1.5 bg-muted/80 backdrop-blur-sm border-b text-xs font-medium text-muted-foreground">
        <div className="w-4 shrink-0" /> {/* Checkbox spacer */}
        <div className="flex-1">Address</div>
        <div className="shrink-0 w-16 text-center">Status</div>
        <div className="w-12 text-right shrink-0">Viols</div>
        <div className="w-10 text-center shrink-0">Score</div>
      </div>
      
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const property = properties[virtualItem.index];
          const isSelected = selectedIds.includes(property.id);

          return (
            <div
              key={property.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
                height: `${COMPACT_ROW_HEIGHT}px`,
              }}
            >
              <CompactPropertyRow
                property={property}
                isSelected={isSelected}
                onToggleSelect={onToggleSelect}
                onClick={() => onPropertyClick(property.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
