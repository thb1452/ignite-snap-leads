import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, X } from "lucide-react";
import { EnforcementAreaFilter } from "./EnforcementAreaFilter";
import { EnforcementSignalsFilter } from "./EnforcementSignalsFilter";
import { PressureLevelFilter } from "./PressureLevelFilter";
import { TimeFilter } from "./ScoreAndTimeFilter";

interface MobileFilterSheetProps {
  // Enforcement area props
  selectedCity: string | null;
  selectedState: string | null;
  onCityChange: (value: string | null) => void;
  onStateChange: (value: string | null) => void;
  // Time props
  lastSeenDays: number | null;
  onLastSeenChange: (value: number | null) => void;
  // Enforcement signals props
  selectedSignal: string | null;
  onSignalChange: (value: string | null) => void;
  // Pressure level props
  openViolationsOnly: boolean;
  onOpenViolationsChange: (value: boolean) => void;
  multipleViolationsOnly: boolean;
  onMultipleViolationsChange: (value: boolean) => void;
  repeatOffenderOnly: boolean;
  onRepeatOffenderChange: (value: boolean) => void;
  // General
  onClearFilters: () => void;
  activeFilterCount: number;
}

export function MobileFilterSheet({
  selectedCity,
  selectedState,
  onCityChange,
  onStateChange,
  lastSeenDays,
  onLastSeenChange,
  selectedSignal,
  onSignalChange,
  openViolationsOnly,
  onOpenViolationsChange,
  multipleViolationsOnly,
  onMultipleViolationsChange,
  repeatOffenderOnly,
  onRepeatOffenderChange,
  onClearFilters,
  activeFilterCount,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-10 min-h-[44px]">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] max-h-[85vh] rounded-t-2xl flex flex-col p-0">
        <SheetHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <SheetTitle className="text-lg font-semibold">Filters</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Filter properties by enforcement area and signals
            </SheetDescription>
          </div>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-muted-foreground h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Clear all
            </Button>
          )}
        </SheetHeader>
        
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Enforcement Area */}
          <EnforcementAreaFilter
            selectedCity={selectedCity}
            selectedState={selectedState}
            onCityChange={onCityChange}
            onStateChange={onStateChange}
          />

          {/* Time Filters */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Date Range
            </h3>
            <TimeFilter
              lastSeenDays={lastSeenDays}
              onLastSeenChange={onLastSeenChange}
            />
          </div>

          {/* Enforcement Signals */}
          <EnforcementSignalsFilter
            selectedSignal={selectedSignal}
            onSignalChange={onSignalChange}
            selectedState={selectedState}
            selectedCity={selectedCity}
          />

          {/* Pressure Level */}
          <PressureLevelFilter
            openViolationsOnly={openViolationsOnly}
            onOpenViolationsChange={onOpenViolationsChange}
            multipleViolationsOnly={multipleViolationsOnly}
            onMultipleViolationsChange={onMultipleViolationsChange}
            repeatOffenderOnly={repeatOffenderOnly}
            onRepeatOffenderChange={onRepeatOffenderChange}
          />
        </div>

        {/* Fixed Apply Button at bottom */}
        <div className="shrink-0 px-4 py-4 border-t bg-background">
          <Button 
            className="w-full h-12 text-base font-medium" 
            onClick={() => setOpen(false)}
          >
            Show Results
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
