import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MobilePropertyCard } from "./MobilePropertyCard";

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
  enforcement_type?: string;
}

interface VirtualizedMobilePropertyListProps {
  properties: Property[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onPropertyClick: (id: string) => void;
  savedSet?: Set<string>;
  onToggleSaved?: (id: string) => void;
  unlockedSet?: Set<string>;
  onUnlock?: (propertyId: string) => void;
}

export function VirtualizedMobilePropertyList({
  properties,
  selectedIds,
  onToggleSelect,
  onPropertyClick,
  savedSet,
  onToggleSaved,
  unlockedSet,
  onUnlock,
}: VirtualizedMobilePropertyListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: properties.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 3,
  });

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto"
      style={{ minHeight: 0 }}
    >
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
              <MobilePropertyCard
                property={property}
                isSelected={isSelected}
                onToggleSelect={onToggleSelect}
                onClick={() => onPropertyClick(property.id)}
                isSaved={savedSet?.has(property.id) ?? false}
                onToggleSaved={onToggleSaved}
                isUnlocked={unlockedSet?.has(property.id) ?? true}
                onUnlock={onUnlock}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
