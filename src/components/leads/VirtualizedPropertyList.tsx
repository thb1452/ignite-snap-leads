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
  unlockedSet?: Set<string>;
  onUnlock?: (propertyId: string) => void;
  /** Compact single-row mode for List view */
  compact?: boolean;
}

const VirtualizedPropertyListInner = ({
  properties,
  selectedIds,
  onToggleSelect,
  onPropertyClick,
  savedSet,
  onToggleSaved,
  unlockedSet,
  onUnlock,
  compact = false,
}: VirtualizedPropertyListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: properties.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => compact ? 68 : 64,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: compact ? 10 : 5,
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
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
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
                isUnlocked={unlockedSet?.has(property.id) ?? false}
                onUnlock={onUnlock}
                compact={compact}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const VirtualizedPropertyList = memo(VirtualizedPropertyListInner);
