import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { callFn } from "@/integrations/http/functions";
import type { LeadFilters } from "@/schemas";

interface AiSearchBarProps {
  onFiltersApplied: (filters: Partial<LeadFilters>) => void;
}

const EXAMPLE_CHIPS = [
  "Open violations in Florida",
  "Repeat offenders score 80+",
  "Structural issues last 30 days",
  "Multiple violations in Texas",
];

export function AiSearchBar({ onFiltersApplied }: AiSearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async (text?: string) => {
    const q = (text ?? query).trim();
    if (!q || loading) return;

    setLoading(true);
    try {
      const res = await callFn<{ filters: Partial<LeadFilters>; message?: string }>(
        "ai-search",
        { query: q }
      );

      if (res.message && (!res.filters || Object.keys(res.filters).length === 0)) {
        toast.info(res.message);
        return;
      }

      if (res.filters && Object.keys(res.filters).length > 0) {
        onFiltersApplied(res.filters);
        toast.success("Filters applied from your search");
        setQuery("");
      }
    } catch (err) {
      console.error("AI search error:", err);
      toast.error("AI search failed — try again or use manual filters");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-2 border-b border-border/50 space-y-1.5">
      <div className="relative">
        {loading ? (
          <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary animate-spin" />
        ) : (
          <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" />
        )}
        <Input
          placeholder="Ask AI: e.g. 'open violations in Florida, score 80+'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          disabled={loading}
          className="pl-8 h-8 text-xs bg-muted/30 border-primary/20 focus-visible:ring-primary/30"
        />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {EXAMPLE_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => {
              setQuery(chip);
              handleSearch(chip);
            }}
            disabled={loading}
            className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
