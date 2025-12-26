import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  snapScoreMin: number;
  lastSeenDays: number | null;
  selectedCity: string | null;
  selectedState: string | null;
  selectedCounty: string | null;
  selectedJurisdiction: string | null;
  propertyCount: number;
  onClearFilters: () => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  snapScoreMin,
  lastSeenDays,
  selectedCity,
  selectedState,
  selectedCounty,
  selectedJurisdiction,
  propertyCount,
  onClearFilters
}: FilterBarProps) {
  const hasActiveFilters = snapScoreMin > 0 || lastSeenDays !== null || 
    selectedCity !== null || selectedState !== null || selectedCounty !== null || selectedJurisdiction !== null;

  return (
    <div className="flex items-center gap-4 p-4 border-b bg-background">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search address, city or zip"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2 flex-1">
        {snapScoreMin > 0 && (
          <Badge variant="secondary" className="gap-1">
            Score ≥ {snapScoreMin}
          </Badge>
        )}
        {lastSeenDays !== null && (
          <Badge variant="secondary" className="gap-1">
            ≤ {lastSeenDays} days
          </Badge>
        )}
        {selectedState && (
          <Badge variant="secondary">
            {selectedState}
          </Badge>
        )}
        {selectedCounty && (
          <Badge variant="secondary">
            {selectedCounty} County
          </Badge>
        )}
        {selectedCity && (
          <Badge variant="secondary">
            {selectedCity}
          </Badge>
        )}
        {selectedJurisdiction && (
          <Badge variant="outline">
            Jurisdiction
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium whitespace-nowrap">
          {propertyCount.toLocaleString()} Properties
        </span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Reset All
          </Button>
        )}
      </div>
    </div>
  );
}
