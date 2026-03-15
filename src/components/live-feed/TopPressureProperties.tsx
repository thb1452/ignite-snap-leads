import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Flame, Clock, Droplets } from "lucide-react";

interface PressureProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  updated_at: string | null;
  newest_violation_date: string | null;
  total_violations: number | null;
  open_violations: number | null;
  violation_types: string[] | null;
  enforcement_type: string;
  escalated: boolean | null;
}

function getScoreBg(score: number | null) {
  if (!score) return "bg-[hsl(var(--muted))]";
  if (score >= 75) return "bg-[hsl(var(--score-red))]";
  if (score >= 50) return "bg-[hsl(var(--score-orange))]";
  if (score >= 25) return "bg-[hsl(var(--score-yellow))]";
  return "bg-[hsl(var(--muted))]";
}

// Known violation-related keywords to validate violation_types entries
const VIOLATION_KEYWORDS = /water|fire|code|violation|struct|vacan|zone|zon|weed|trash|debris|nuisance|safety|electric|plumb|heat|graffiti|rodent|abandon|sanit|permit|construct|fence|tree|shrub|grass|stagnant|shutoff|disconnect|occupy|condemn|hazard|maintenance|inspection|enforcement|animal|noise|sign|parking|vehicle|property|building|roof|window|door|yard|pool|dump|junk|litter|sewage|drain|mold|pest|neglect|blight|complaint/i;
const NOISY_TYPES = /home occupation|illegal occupancy certificate|^illi/i;

/** Returns true if the string looks like an actual violation type, not a person name */
/** Masks the street number for public display: "4948 W 21st PL" → "4●●● W 21st PL" */
function maskStreetNumber(address: string): string {
  return address.replace(/^(\d)\d+/, (match, first) => {
    return first + '●'.repeat(match.length - 1);
  });
}

function isValidViolationType(v: string): boolean {
  if (!v || v === "Unknown") return false;
  if (NOISY_TYPES.test(v)) return false;
  // If it contains violation-related keywords, keep it
  if (VIOLATION_KEYWORDS.test(v)) return true;
  // If it contains a dash (like "IPMC 109 - something"), keep it
  if (v.includes(" - ")) return true;
  // Short strings with only 1-2 capitalized words and no keywords = likely a person name
  const words = v.trim().split(/\s+/);
  if (words.length <= 3 && words.every(w => /^[A-Z][a-z]+$/.test(w))) return false;
  // Default: keep it if it's long enough to be a description
  return v.length > 5;
}

export function TopPressureProperties() {
  const { data: properties = [], isLoading } = useQuery<PressureProperty[]>({
    queryKey: ["top-pressure-properties"],
    queryFn: async () => {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch recent high-score properties, ordered by recency
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, city, state, zip, snap_score, snap_insight, updated_at, newest_violation_date, total_violations, open_violations, violation_types, enforcement_type, escalated")
        .not("snap_score", "is", null)
        .gte("snap_score", 50)
        .gte("updated_at", fourteenDaysAgo)
        .order("updated_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      const rows = (data ?? []) as PressureProperty[];

      // Pick a diverse mix: prioritize critical (75+) but ensure score variety
      const critical = rows.filter((r) => (r.snap_score ?? 0) >= 75);
      const high = rows.filter((r) => (r.snap_score ?? 0) >= 50 && (r.snap_score ?? 0) < 75);

      // Deduplicate by score to get variety
      const seen = new Set<number>();
      const diverse: PressureProperty[] = [];
      for (const p of critical) {
        if (diverse.length >= 6) break;
        const s = p.snap_score ?? 0;
        if (!seen.has(s)) {
          seen.add(s);
          diverse.push(p);
        }
      }
      // If we don't have enough unique scores, fill with remaining critical
      if (diverse.length < 6) {
        for (const p of critical) {
          if (diverse.length >= 6) break;
          if (!diverse.includes(p)) diverse.push(p);
        }
      }
      // Fill remaining slots with high-score properties
      for (const p of high) {
        if (diverse.length >= 8) break;
        diverse.push(p);
      }

      return diverse;
    },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2 mb-6">
          <Skeleton className="h-7 w-64 mx-auto bg-[hsl(var(--landing-surface)/0.5)]" />
          <Skeleton className="h-4 w-80 mx-auto bg-[hsl(var(--landing-surface)/0.3)]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl bg-[hsl(var(--landing-surface)/0.5)]" />
          ))}
        </div>
      </div>
    );
  }

  if (properties.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <h3 className="text-xl font-bold text-[hsl(var(--landing-text))]">
          Properties Under Pressure Now
        </h3>
        <p className="text-sm text-[hsl(var(--landing-text-muted))]">
          Highest SnapScore properties with active enforcement
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {properties.map((property, i) => {
          const openCount = property.open_violations ?? 0;
          const totalCount = property.total_violations ?? 0;
          const isWater = property.enforcement_type === "water_shutoff";

          const violationLabel = isWater
            ? "Water Disconnection"
            : property.violation_types
                ?.filter(isValidViolationType)
                .slice(0, 1)
                .map(formatViolationType)[0] ?? "Code Violation";

          return (
            <motion.div
              key={property.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="rounded-xl border border-[hsl(var(--landing-surface)/0.6)] bg-[hsl(var(--landing-surface)/0.15)] p-4 hover:bg-[hsl(var(--landing-surface)/0.25)] transition-all duration-200 backdrop-blur-sm"
            >
              {/* Row 1: Address + Score circle */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[hsl(var(--landing-text))] leading-tight truncate">
                    {maskStreetNumber(formatAddress(property.address))}
                  </p>
                  <p className="text-xs text-[hsl(var(--landing-text-muted))] mt-0.5">
                    {formatCity(property.city)}, {property.state} {property.zip}
                  </p>
                </div>

                {/* Score circle */}
                <div
                  className={`${getScoreBg(property.snap_score)} w-9 h-9 rounded-full flex items-center justify-center shrink-0`}
                >
                  <span className="text-xs font-bold text-white leading-none">
                    {property.snap_score ?? 0}
                  </span>
                </div>
              </div>

              {/* Row 2: Violation type tag */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="flex items-center gap-1 text-[11px] text-amber-400">
                  {isWater ? (
                    <Droplets className="h-3 w-3 text-cyan-400" />
                  ) : (
                    <Flame className="h-3 w-3" />
                  )}
                  <span className={isWater ? "text-cyan-400" : ""}>
                    {violationLabel.length > 28
                      ? violationLabel.slice(0, 25) + "…"
                      : violationLabel}
                  </span>
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
