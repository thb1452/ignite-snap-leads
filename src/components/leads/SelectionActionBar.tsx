import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Download, X, Loader2, ChevronDown, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import type { SelectMode } from "./BulkActionBar";

interface SelectionActionBarProps {
  selectedCount: number;
  onExportCSV: () => void;
  onAddToList: () => void;
  onClearSelection: () => void;
  isExporting?: boolean;
  // Three-mode selection props
  visibleCount?: number;
  allVisibleSelected?: boolean;
  onToggleSelectAll?: () => void;
  onSelectVisible?: () => void;
  onSelectCustomAmount?: (amount: number) => void;
  onSelectMax?: (amount: number) => void;
  totalFilteredCount?: number;
  showSelectMax?: boolean;
  // Export limit enforcement
  exportRemaining?: number | null;
}

export function SelectionActionBar({
  selectedCount,
  onExportCSV,
  onAddToList,
  onClearSelection,
  isExporting = false,
  visibleCount = 0,
  allVisibleSelected = false,
  onToggleSelectAll,
  onSelectVisible,
  onSelectCustomAmount,
  onSelectMax,
  totalFilteredCount,
  showSelectMax = true,
  exportRemaining,
}: SelectionActionBarProps) {
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

  const isOverExportLimit = exportRemaining !== null && exportRemaining !== undefined && selectedCount > exportRemaining;

  // Use portal to render outside any clipping containers
  const content = (
    <AnimatePresence>
      {hasSelection && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed left-4 right-4 bottom-[140px] z-[9999] max-w-md mx-auto"
        >
          <div className="bg-background border border-border rounded-xl shadow-2xl p-3">
            {/* Export limit warning */}
            {isOverExportLimit && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-2 px-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {exportRemaining! > 0
                    ? `${exportRemaining!.toLocaleString()} exports available — tap Export to see partial export options.`
                    : "No exports remaining — tap Export to see pay-as-you-go options."}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {/* Split checkbox + selection count */}
              <div className="flex items-center gap-2 shrink-0 relative" ref={dropdownRef}>
                <div className="flex items-center">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={() => onToggleSelectAll?.()}
                    className="h-5 w-5"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen(!dropdownOpen);
                      setShowCustomInput(false);
                    }}
                    className="ml-0.5 p-0.5 rounded hover:bg-muted transition-colors"
                    aria-label="Selection options"
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>

                {/* Dropdown menu */}
                {dropdownOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-popover border border-border rounded-md shadow-md py-1 min-w-[200px] z-[10000]">
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => {
                        if (onSelectVisible) onSelectVisible();
                        else onToggleSelectAll?.();
                        setDropdownOpen(false);
                      }}
                    >
                      Select Visible
                      {visibleCount > 0 && (
                        <span className="text-muted-foreground ml-1">({visibleCount})</span>
                      )}
                    </button>

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

                <span className="text-sm font-medium whitespace-nowrap">
                  {selectedCount.toLocaleString()} properties selected
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportCSV();
                  }}
                  disabled={isExporting || !hasSelection}
                  className="h-9 gap-1.5 px-3"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Export</span>
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearSelection();
                  }}
                  disabled={isExporting}
                  className="h-9 px-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only sm:ml-1">Clear</span>
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Portal to document.body to escape any overflow containers
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
