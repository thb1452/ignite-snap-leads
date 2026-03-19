import { useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PropertyCard } from "./PropertyCard";

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
  savedSet?: Set<string>;
  onToggleSaved?: (id: string) => void;
}

// Rich card height - accommodates full insight text, violation badges, freshness
const CARD_HEIGHT = 140;

const VirtualizedPropertyListInner = ({
  properties,
  selectedIds,
  onToggleSelect,
  onPropertyClick,
  savedSet,
  onToggleSaved,
}: VirtualizedPropertyListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: properties.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
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
              }}
            >
              <PropertyCard
                property={property}
                isSelected={isSelected}
                onToggleSelect={onToggleSelect}
                onClick={() => onPropertyClick(property.id)}
                isSaved={savedSet?.has(property.id) ?? false}
                onToggleSaved={onToggleSaved}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const VirtualizedPropertyList = memo(VirtualizedPropertyListInner);
