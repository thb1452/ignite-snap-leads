import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/externalClient";

interface ScarcityBadgeProps {
  propertyId: string;
}

export function ScarcityBadge({ propertyId }: ScarcityBadgeProps) {
  const { data: count } = useQuery({
    queryKey: ["unlock-count", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_get_unlock_count", {
        p_property_id: propertyId,
      });
      if (error) return 0;
      return (data as number) ?? 0;
    },
    staleTime: 60000,
    enabled: !!propertyId,
  });

  if (!count || count < 2) return null;

  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 h-[16px] bg-violet-50 text-violet-600 border-violet-200 gap-0.5"
    >
      <Users className="h-2.5 w-2.5" />
      {count} unlocked
    </Badge>
  );
}
