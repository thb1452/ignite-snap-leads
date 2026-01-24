import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Download, ListPlus, Loader2 } from "lucide-react";

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
  const hasSelection = selectedCount > 0;
  
  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onToggleSelectAll}
          />
          <span className="text-sm font-medium">
            {hasSelection ? `${selectedCount} selected` : `Select all ${totalCount > 0 ? `(${totalCount})` : ''}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasSelection && (
            <>
              <Button
                onClick={onSkipTrace}
                disabled={isTracing || !hasSelection}
                variant="default"
                className="gap-2"
              >
                {isTracing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isTracing ? 'Exporting...' : `Export CSV (${selectedCount})`}
              </Button>
              <Button
                variant="outline"
                onClick={onView}
                disabled={isTracing || !hasSelection}
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
