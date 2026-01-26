import { Button } from "@/components/ui/button";
import { Download, X, ListPlus, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SelectionActionBarProps {
  selectedCount: number;
  onExportCSV: () => void;
  onAddToList: () => void;
  onClearSelection: () => void;
  isExporting?: boolean;
}

export function SelectionActionBar({
  selectedCount,
  onExportCSV,
  onAddToList,
  onClearSelection,
  isExporting = false,
}: SelectionActionBarProps) {
  const hasSelection = selectedCount > 0;
  
  return (
    <AnimatePresence>
      {hasSelection && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md"
        >
          <div className="bg-background border border-border rounded-xl shadow-xl p-3">
            <div className="flex items-center justify-between gap-2">
              {/* Selection count with checkbox icon */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
                  <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm font-medium whitespace-nowrap">
                  {selectedCount} selected
                </span>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={onExportCSV}
                  disabled={isExporting || !hasSelection}
                  className="h-9 gap-1.5 px-3"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>Export</span>
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearSelection}
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
}
