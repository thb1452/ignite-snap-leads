import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PropertyCard } from "./PropertyCard";

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  updated_at: string | null;
}

interface VirtualizedPropertyListProps {
  properties: Property[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onPropertyClick: (id: string) => void;
}

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
    estimateSize: () => 120,
    overscan: 5,
  });

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
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
