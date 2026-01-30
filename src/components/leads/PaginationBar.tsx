import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-background">
      <div className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-semibold text-foreground">{start.toLocaleString()}-{end.toLocaleString()}</span>
        {" "}of{" "}
        <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span>
        {" "}properties
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="h-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {renderPageNumbers(page, totalPages, onPageChange)}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="h-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {onPageSizeChange && (
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(parseInt(value))}
          >
            <SelectTrigger className="w-[100px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25/page</SelectItem>
              <SelectItem value="50">50/page</SelectItem>
              <SelectItem value="100">100/page</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function renderPageNumbers(
  currentPage: number,
  totalPages: number,
  onPageChange: (page: number) => void
) {
  const pages: (number | "...")[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);

    if (currentPage > 3) {
      pages.push("...");
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push("...");
    }

    pages.push(totalPages);
  }

  return pages.map((p, idx) => {
    if (p === "...") {
      return (
        <span
          key={`ellipsis-${idx}`}
          className="px-2 text-sm text-muted-foreground"
        >
          …
        </span>
      );
    }

    const isActive = p === currentPage;
    return (
      <Button
        key={p}
        variant={isActive ? "default" : "ghost"}
        size="sm"
        onClick={() => onPageChange(p)}
        className={`h-8 w-8 p-0 ${isActive ? "" : "text-muted-foreground"}`}
      >
        {p}
      </Button>
    );
  });
}
