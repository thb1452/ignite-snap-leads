import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface JobResultsFiltersProps {
  filter: 'all' | 'success' | 'no_match' | 'vendor_error' | 'timeout';
  onChange: (filter: 'all' | 'success' | 'no_match' | 'vendor_error' | 'timeout') => void;
  total: number;
  succeeded: number;
  failed: number;
}

export function JobResultsFilters({ 
  filter, 
  onChange, 
  total, 
  succeeded, 
  failed 
}: JobResultsFiltersProps) {
  const filters = [
    { value: 'all' as const, label: `All (${total})` },
    { value: 'success' as const, label: `Success (${succeeded})` },
    { value: 'no_match' as const, label: `No Match (${failed})` },
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search address..."
          className="pl-9"
        />
      </div>
    </div>
  );
}
