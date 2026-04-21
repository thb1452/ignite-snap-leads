import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  TrendingDown,
  TrendingUp,
  Droplet,
  FileWarning,
  Gavel,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  usePropertyDistressEvents,
  type DistressEvent,
} from "@/hooks/useDistressEvents";

interface Props {
  propertyId: string | undefined;
}

const EVENT_META: Record<
  DistressEvent["event_type"],
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  snapscore_change: { label: "SnapScore change", Icon: Activity },
  new_violation: { label: "New violation", Icon: FileWarning },
  water_shutoff: { label: "Water shutoff", Icon: Droplet },
  lis_pendens: { label: "Lis pendens", Icon: Gavel },
  tax_delinquency: { label: "Tax delinquency", Icon: AlertTriangle },
  code_escalation: { label: "Code escalation", Icon: AlertTriangle },
};

const SEVERITY_STYLES: Record<DistressEvent["severity"], string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

function describeEvent(event: DistressEvent): string {
  const d = event.delta ?? {};
  switch (event.event_type) {
    case "snapscore_change": {
      const before = (d.before as number | undefined) ?? null;
      const after = (d.after as number | undefined) ?? null;
      const delta = (d.delta as number | undefined) ?? 0;
      const arrow = delta > 0 ? "↑" : "↓";
      return `SnapScore ${before ?? "?"} → ${after ?? "?"} (${arrow}${Math.abs(delta)})`;
    }
    case "new_violation": {
      const type = (d.violation_type as string | undefined) ?? "violation";
      return `New ${type} citation logged`;
    }
    case "water_shutoff":
      return "Water service disconnected";
    case "lis_pendens":
      return "Lis pendens filed";
    case "tax_delinquency":
      return "Tax delinquency reported";
    case "code_escalation":
      return "Enforcement action escalated";
    default:
      return "Distress event";
  }
}

export function DistressTimeline({ propertyId }: Props) {
  const { data: events, isLoading } = usePropertyDistressEvents(propertyId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
            Distress Timeline
          </CardTitle>
          {events && events.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {events.length} {events.length === 1 ? "event" : "events"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No distress events logged yet. The timeline updates live as new
            violations, score changes, or enforcement actions are detected.
          </p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-4">
            {events.map((event) => {
              const meta = EVENT_META[event.event_type];
              const Icon = meta.Icon;
              const isUpScore =
                event.event_type === "snapscore_change" &&
                ((event.delta?.delta as number) ?? 0) > 0;
              const ScoreIcon = isUpScore ? TrendingUp : TrendingDown;
              return (
                <li key={event.id} className="ml-4">
                  <span
                    className={cn(
                      "absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
                      event.severity === "critical"
                        ? "bg-destructive"
                        : event.severity === "warning"
                          ? "bg-warning"
                          : "bg-muted-foreground",
                    )}
                  />
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {event.event_type === "snapscore_change" ? (
                        <ScoreIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <p className="text-sm font-medium truncate">
                        {describeEvent(event)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] uppercase", SEVERITY_STYLES[event.severity])}
                    >
                      {event.severity}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{meta.label}</span>
                    <span>•</span>
                    <span>
                      {formatDistanceToNow(new Date(event.detected_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
