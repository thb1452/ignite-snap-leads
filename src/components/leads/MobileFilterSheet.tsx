import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, X } from "lucide-react";
import { LocationFilter } from "./LocationFilter";
import { FilterControls } from "./FilterControls";

interface MobileFilterSheetProps {
  // Location filter props
  selectedJurisdiction: string | null;
  selectedCity: string | null;
  selectedState: string | null;
  selectedCounty: string | null;
  onJurisdictionChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  onStateChange: (value: string | null) => void;
  onCountyChange: (value: string | null) => void;
  // Filter controls props
  snapScoreMin: number;
  onSnapScoreChange: (value: number) => void;
  lastSeenDays: number | null;
  onLastSeenChange: (value: number | null) => void;
  selectedSource: string | null;
  onSourceChange: (value: string | null) => void;
  // General
  onClearFilters: () => void;
  activeFilterCount: number;
}

export function MobileFilterSheet({
  selectedJurisdiction,
  selectedCity,
  selectedState,
  selectedCounty,
  onJurisdictionChange,
  onCityChange,
  onStateChange,
  onCountyChange,
  snapScoreMin,
  onSnapScoreChange,
  lastSeenDays,
  onLastSeenChange,
  selectedSource,
  onSourceChange,
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
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl px-4 pt-4 pb-8">
        <SheetHeader className="flex flex-row items-center justify-between pb-4 border-b">
          <SheetTitle className="text-lg font-semibold">Filters</SheetTitle>
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
        
        <div className="overflow-y-auto flex-1 py-6 space-y-6">
          {/* Location Filters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Location
            </h3>
            <div className="space-y-4">
              <LocationFilter
                selectedJurisdiction={selectedJurisdiction}
                selectedCity={selectedCity}
                selectedState={selectedState}
                selectedCounty={selectedCounty}
                onJurisdictionChange={onJurisdictionChange}
                onCityChange={onCityChange}
                onStateChange={onStateChange}
                onCountyChange={onCountyChange}
              />
            </div>
          </div>

          {/* Other Filters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Property Filters
            </h3>
            <div className="space-y-4">
              <FilterControls
                snapScoreMin={snapScoreMin}
                onSnapScoreChange={onSnapScoreChange}
                lastSeenDays={lastSeenDays}
                onLastSeenChange={onLastSeenChange}
                selectedSource={selectedSource}
                onSourceChange={onSourceChange}
              />
            </div>
          </div>
        </div>

        {/* Apply Button */}
        <div className="pt-4 border-t mt-auto">
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
