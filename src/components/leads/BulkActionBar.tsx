import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Zap, Eye } from "lucide-react";

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
    <div className="sticky bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onToggleSelectAll}
          />
          <span className="text-sm font-medium">
            Select all {totalCount > 0 && `(${totalCount})`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Button
              onClick={onSkipTrace}
              disabled={isTracing}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Skip Trace ({selectedCount})
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={onView}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            View
          </Button>
        </div>
      </div>
    </div>
  );
}
