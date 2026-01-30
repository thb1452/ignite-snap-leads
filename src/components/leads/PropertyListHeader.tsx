import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";

interface PropertyListHeaderProps {
  totalCount: number;
  selectedCount: number;
  locationSummary?: string;
  sortBy?: string;
  onSortChange?: (value: string) => void;
}

export function PropertyListHeader({
  totalCount,
  selectedCount,
  locationSummary,
  sortBy = "snapscore",
  onSortChange,
}: PropertyListHeaderProps) {
  const formattedCount = totalCount.toLocaleString();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-muted/30 border-b">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">
            {formattedCount} properties found
          </span>
        </div>
        
        {locationSummary && (
          <Badge variant="outline" className="font-normal">
            {locationSummary}
          </Badge>
        )}
        
        {selectedCount > 0 && (
          <Badge variant="secondary" className="font-medium">
            {selectedCount} selected
          </Badge>
        )}
      </div>

      {onSortChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sorted by:</span>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="snapscore">SnapScore (High→Low)</SelectItem>
              <SelectItem value="violations">Most Violations</SelectItem>
              <SelectItem value="recent">Recently Updated</SelectItem>
              <SelectItem value="oldest">Oldest Violations</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
