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
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
        >
          <div className="bg-background border border-border rounded-xl shadow-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  ✓ {selectedCount} {selectedCount === 1 ? 'property' : 'properties'} selected
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddToList}
                  disabled={isExporting || !hasSelection}
                  className="h-9 gap-1.5"
                >
                  <ListPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add to List</span>
                </Button>
                
                <Button
                  size="sm"
                  onClick={onExportCSV}
                  disabled={isExporting || !hasSelection}
                  className="h-9 gap-1.5"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {isExporting ? 'Exporting...' : 'Export CSV'}
                  </span>
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClearSelection}
                  disabled={isExporting}
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Clear selection</span>
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
