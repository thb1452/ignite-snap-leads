import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Flame, Droplets, FileWarning, Building2 } from "lucide-react";

interface PressureProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  snap_score: number;
  snap_insight: string | null;
  distress_signals: string[] | null;
  total_violations: number;
  escalated: boolean;
}

function getScoreLabel(score: number) {
  if (score >= 80) return { label: "Critical", className: "bg-red-500/20 text-red-400 border-red-500/30" };
  if (score >= 60) return { label: "High", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
  if (score >= 40) return { label: "Moderate", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
  return { label: "Low", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
}

function getPropertyIcon(signals: string[] | null, escalated: boolean) {
  if (escalated) return <Flame className="h-5 w-5 text-red-400 shrink-0" />;
  const joined = (signals ?? []).join(" ").toLowerCase();
  if (joined.includes("water") || joined.includes("shutoff")) return <Droplets className="h-5 w-5 text-blue-400 shrink-0" />;
  if (joined.includes("fire") || joined.includes("condemned")) return <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0" />;
  if (joined.includes("vacant") || joined.includes("abandon")) return <Building2 className="h-5 w-5 text-purple-400 shrink-0" />;
  return <FileWarning className="h-5 w-5 text-amber-400 shrink-0" />;
}

export function TopPressureProperties() {
  const { data: properties = [], isLoading } = useQuery<PressureProperty[]>({
    queryKey: ["top-pressure-properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, address, city, state, snap_score, snap_insight, distress_signals, total_violations, escalated")
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
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full bg-white/[0.06]" />
        ))}
      </div>
    );
  }

  if (properties.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden backdrop-blur-sm">
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Properties Under Pressure Now
        </h3>
      </div>

      <ScrollArea className="h-[520px]">
        <div className="divide-y divide-white/[0.04]">
          {properties.map((prop, i) => {
            const score = getScoreLabel(prop.snap_score);
            return (
              <motion.div
                key={prop.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="px-6 py-4 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {getPropertyIcon(prop.distress_signals, prop.escalated ?? false)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white/90 truncate">
                        {prop.address}
                      </span>
                      <span className="text-xs text-white/40 shrink-0">
                        {prop.city}{prop.state ? `, ${prop.state}` : ""}
                      </span>
                    </div>
                    {prop.snap_insight && (
                      <p className="text-xs text-white/50 leading-relaxed line-clamp-2">
                        {prop.snap_insight}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-lg font-bold text-white/90 tabular-nums">
                      {prop.snap_score}<span className="text-xs text-white/30 font-normal">/100</span>
                    </span>
                    <Badge className={`text-[10px] px-1.5 py-0 border ${score.className}`}>
                      {score.label}
                    </Badge>
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
