import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DistressEvent = {
  id: string;
  property_id: string;
  event_type:
    | "snapscore_change"
    | "new_violation"
    | "water_shutoff"
    | "lis_pendens"
    | "tax_delinquency"
    | "code_escalation";
  severity: "info" | "warning" | "critical";
  delta: Record<string, unknown>;
  source: string;
  detected_at: string;
};

/**
 * Fetches distress events for a property, with realtime updates so the
 * timeline refreshes the moment a new event is logged by a trigger.
 */
export function usePropertyDistressEvents(propertyId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["distress-events", propertyId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<DistressEvent[]> => {
      const { data, error } = await supabase
        .from("distress_events")
        .select("*")
        .eq("property_id", propertyId!)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as DistressEvent[];
    },
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  // Realtime subscription scoped to this property
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`distress_events:${propertyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "distress_events",
          filter: `property_id=eq.${propertyId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [propertyId, qc]);

  return query;
}
