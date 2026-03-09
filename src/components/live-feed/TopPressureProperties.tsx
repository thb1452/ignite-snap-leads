import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatViolationType } from "@/utils/formatViolationType";
import { formatAddress, formatCity } from "@/utils/formatAddress";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Flame, Clock } from "lucide-react";

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

function getScoreColor(score: number | null) {
  if (!score) return "bg-[hsl(var(--muted))]";
  if (score >= 75) return "bg-[hsl(var(--score-red))]";
  if (score >= 50) return "bg-[hsl(var(--score-orange))]";
  if (score >= 25) return "bg-[hsl(var(--score-yellow))]";
  return "bg-[hsl(var(--score-blue))]";
}

export function TopPressureProperties() {
  const { data: properties = [], isLoading } = useQuery<PressureProperty[]>({
    queryKey: ["top-pressure-properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, city, state, zip, snap_score, snap_insight, updated_at, newest_violation_date, total_violations, open_violations, violation_types, enforcement_type, escalated")
        .not("snap_score", "is", null)
        .gte("snap_score", 50)
        .order("snap_score", { ascending: false })
        .limit(15);

      if (error) throw error;
      return (data ?? []) as PressureProperty[];
    },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[hsl(var(--landing-surface))] bg-[hsl(var(--landing-surface)/0.3)] p-6 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full bg-[hsl(var(--landing-surface)/0.5)]" />
        ))}
      </div>
    );
  }

  if (properties.length === 0) return null;

  return (
    <div className="rounded-xl border border-[hsl(var(--landing-surface))] bg-[hsl(var(--landing-surface)/0.2)] overflow-hidden backdrop-blur-sm">
      <div className="px-6 py-4 border-b border-[hsl(var(--landing-surface)/0.5)]">
        <h3 className="text-sm font-semibold text-[hsl(var(--landing-text-muted))] uppercase tracking-wider">
          Properties Under Pressure Now
        </h3>
      </div>

      <ScrollArea className="h-[600px]">
        <div>
          {properties.map((property, i) => {
            const openCount = property.open_violations ?? 0;
            const totalCount = property.total_violations ?? 0;
            const extraTypes = (property.violation_types?.length ?? 0) > 2 ? (property.violation_types!.length - 2) : 0;

            const freshness = property.updated_at
              ? formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })
              : null;

            const isHeatingUp = (() => {
              const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const updatedAt = property.updated_at ? new Date(property.updated_at).getTime() : 0;
              const newestViolation = property.newest_violation_date ? new Date(property.newest_violation_date).getTime() : 0;
              return updatedAt > sevenDaysAgo || newestViolation > sevenDaysAgo;
            })();

            const insightText = property.snap_insight || "";
            const displayInsight = insightText.length > 160 ? insightText.slice(0, 157) + "..." : insightText;

            return (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
                className="px-4 py-3 border-b border-[hsl(var(--landing-surface)/0.3)] hover:bg-[hsl(var(--landing-surface)/0.15)] transition-colors"
              >
                {/* Row 1: Address + Score */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[hsl(var(--landing-text))] leading-tight truncate">
                        {formatAddress(property.address)}, {formatCity(property.city)}, {property.state} {property.zip}
                      </span>
                      <Badge
                        className={`${getScoreColor(property.snap_score)} text-[hsl(0,0%,100%)] text-xs px-2 py-0.5 h-5 shrink-0 font-bold border-0`}
                      >
                        {property.snap_score || 0}
                      </Badge>
                    </div>

                    {/* Row 2: Status + Violation types + Heating Up */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {isHeatingUp && (
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-amber-500/10 text-amber-400 border-amber-500/30 gap-0.5 animate-pulse">
                          <Flame className="h-3 w-3" />
                          New Activity
                        </Badge>
                      )}
                      {openCount > 0 ? (
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          open
                        </Badge>
                      ) : totalCount > 0 ? (
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-rose-500/10 text-rose-400 border-rose-500/30">
                          closed
                        </Badge>
                      ) : null}

                      {property.enforcement_type === 'water_shutoff' ? (
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30 gap-0.5">
                          💧 Water Disconnection
                        </Badge>
                      ) : (
                        <>
                          {property.violation_types && property.violation_types.filter(v => v !== 'Unknown').slice(0, 2).map((vt, vi) => (
                            <Badge key={vi} variant="outline" className="text-[11px] px-1.5 py-0 h-[18px] bg-orange-500/10 text-orange-400 border-orange-500/30 gap-0.5">
                              <Flame className="h-3 w-3" />
                              {formatViolationType(vt)}
                            </Badge>
                          ))}
                          {extraTypes > 0 && (
                            <span className="text-[11px] text-[hsl(var(--landing-text-muted))]">+{extraTypes}</span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Row 3: AI Insight */}
                    {displayInsight && (
                      <p className="mt-1.5 text-xs text-[hsl(var(--landing-text-muted))] leading-relaxed">
                        {displayInsight}
                      </p>
                    )}

                    {/* Row 4: Freshness */}
                    {freshness && (
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-[hsl(var(--landing-text-muted)/0.6)]">
                        <Clock className="h-3 w-3" />
                        <span>Snap updated {freshness}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
