import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Download, ListPlus } from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onSkipTrace: () => void;
  onView: () => void;
  isTracing?: boolean;
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  allSelected,
  onToggleSelectAll,
  onSkipTrace,
  onView,
  isTracing = false
}: BulkActionBarProps) {
  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onToggleSelectAll}
          />
          <span className="text-sm font-medium">
            {selectedCount > 0 ? `${selectedCount} selected` : `Select all ${totalCount > 0 ? `(${totalCount})` : ''}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <Button
                onClick={onSkipTrace}
                disabled={isTracing || selectedCount === 0}
                variant="default"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV ({selectedCount})
              </Button>
              <Button
                variant="outline"
                onClick={onView}
                className="gap-2"
              >
                <ListPlus className="h-4 w-4" />
                Add to List
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
