import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Droplets, FileWarning } from "lucide-react";

interface FeedItem {
  id: string;
  violation_type: string;
  description: string | null;
  created_at: string;
  status: string;
  property_address: string;
  property_city: string;
  property_state: string;
}

function getViolationIcon(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes("water") || lower.includes("shutoff")) {
    return <Droplets className="h-4 w-4 text-blue-500 shrink-0" />;
  }
  if (lower.includes("fire") || lower.includes("safety")) {
    return <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />;
  }
  return <FileWarning className="h-4 w-4 text-primary shrink-0" />;
}

export function LiveActivityFeed() {
  const { data: items = [], isLoading } = useQuery<FeedItem[]>({
    queryKey: ["live-activity-feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("violations")
        .select(`
          id,
          violation_type,
          description,
          created_at,
          status,
          properties!inner(address, city, state)
        `)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) throw error;

      return (data ?? []).map((v: any) => ({
        id: v.id,
        violation_type: v.violation_type,
        description: v.description,
        created_at: v.created_at,
        status: v.status,
        property_address: v.properties?.address ?? "Unknown",
        property_city: v.properties?.city ?? "",
        property_state: v.properties?.state ?? "",
      }));
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Recent Activity
        </h3>
      </div>

      <ScrollArea className="h-[480px]">
        <div className="divide-y divide-border">
          {items.map((item, i) => {
            let timeAgo: string;
            try {
              timeAgo = formatDistanceToNow(parseISO(item.created_at), { addSuffix: true });
            } catch {
              timeAgo = "";
            }

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="px-6 py-4 hover:bg-muted/40 transition-colors cursor-default"
              >
                <div className="flex items-start gap-3">
                  {getViolationIcon(item.violation_type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground leading-snug">
                      <span className="font-semibold">{item.violation_type}</span>
                      {" filed – "}
                      <span className="text-muted-foreground">
                        {item.property_address}, {item.property_city}
                        {item.property_state ? `, ${item.property_state}` : ""}
                      </span>
                    </p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {timeAgo}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
