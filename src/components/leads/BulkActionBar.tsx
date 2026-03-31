import { useState, useRef, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, ListPlus, Loader2, ChevronDown, AlertTriangle } from "lucide-react";

export type SelectMode = "page" | "custom" | "all";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onExport: () => void;
  onAddToList: () => void;
  isExporting?: boolean;
  // New props for three-mode selection
  onSelectVisible?: () => void;
  onSelectCustomAmount?: (amount: number) => void;
  onSelectMax?: (amount: number) => void;
  totalFilteredCount?: number;
  showSelectMax?: boolean;
  // Export limit enforcement
  exportRemaining?: number | null; // null = unlimited
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  allSelected,
  onToggleSelectAll,
  onExport,
  onAddToList,
  isExporting = false,
  onSelectVisible,
  onSelectCustomAmount,
  onSelectMax,
  totalFilteredCount,
  showSelectMax = true,
  exportRemaining,
}: BulkActionBarProps) {
  const hasSelection = selectedCount > 0;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setShowCustomInput(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  // Focus input when custom input appears
  useEffect(() => {
    if (showCustomInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCustomInput]);

  const handleCustomConfirm = () => {
    const num = parseInt(customAmount, 10);
    if (num > 0 && onSelectCustomAmount) {
      onSelectCustomAmount(num);
    }
    setCustomAmount("");
    setShowCustomInput(false);
    setDropdownOpen(false);
  };

  // Export limit check
  const isOverExportLimit = exportRemaining !== null && exportRemaining !== undefined && selectedCount > exportRemaining;

  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {/* Split checkbox control */}
          <div className="flex items-center" ref={dropdownRef}>
            {/* Left: standard checkbox */}
            <Checkbox
              checked={allSelected}
              onCheckedChange={onToggleSelectAll}
            />
            {/* Right: dropdown arrow */}
            <button
              onClick={() => {
                setDropdownOpen(!dropdownOpen);
                setShowCustomInput(false);
              }}
              className="ml-0.5 p-0.5 rounded hover:bg-muted transition-colors"
              aria-label="Selection options"
            >
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute bottom-full mb-1 left-4 bg-popover border border-border rounded-md shadow-md py-1 min-w-[200px] z-50">
                {/* Select Visible */}
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                  onClick={() => {
                    if (onSelectVisible) onSelectVisible();
                    else onToggleSelectAll();
                    setDropdownOpen(false);
                  }}
                >
                  Select Visible
                  <span className="text-muted-foreground ml-1">({totalCount})</span>
                </button>

                {/* Custom Amount */}
                {!showCustomInput ? (
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => setShowCustomInput(true)}
                  >
                    Custom Amount
                  </button>
                ) : (
                  <div className="px-3 py-2 flex items-center gap-2">
                    <Input
                      ref={inputRef}
                      type="number"
                      min={1}
                      placeholder="Enter number..."
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCustomConfirm();
                        if (e.key === "Escape") {
                          setShowCustomInput(false);
                          setCustomAmount("");
                        }
                      }}
                      className="h-7 text-sm w-28"
                    />
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleCustomConfirm}
                      disabled={!customAmount || parseInt(customAmount, 10) <= 0}
                    >
                      Select
                    </Button>
                  </div>
                )}

                {/* Select Max — hidden when 0 available */}
                {showSelectMax && onSelectMax && (() => {
                  const maxAmount = exportRemaining === null || exportRemaining === undefined
                    ? (totalFilteredCount ?? 0)
                    : Math.min(exportRemaining, totalFilteredCount ?? 0);
                  if (maxAmount === 0) return null;

                  return (
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => {
                        onSelectMax(maxAmount);
                        setDropdownOpen(false);
                      }}
                    >
                      Select Max
                      <span className="text-muted-foreground ml-1">
                        ({maxAmount.toLocaleString()})
                      </span>
                    </button>
                  );
                })()}
              </div>
            )}
          </div>

          <span className="text-sm font-medium">
            {hasSelection
              ? `${selectedCount.toLocaleString()} properties selected`
              : `Select all ${totalCount > 0 ? `(${totalCount})` : ""}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Export limit warning */}
          {hasSelection && isOverExportLimit && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 mr-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {exportRemaining! > 0
                  ? `${exportRemaining!.toLocaleString()} exports available — click Export to see partial export options.`
                  : "No exports remaining — click Export to see pay-as-you-go options."}
              </span>
            </div>
          )}

          {hasSelection && (
            <>
              <Button
                onClick={onExport}
                disabled={isExporting || !hasSelection}
                variant="default"
                className="gap-2"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isExporting ? "Exporting..." : `Export CSV (${selectedCount.toLocaleString()})`}
              </Button>
              <Button
                variant="outline"
                onClick={onAddToList}
                disabled={isExporting || !hasSelection}
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
