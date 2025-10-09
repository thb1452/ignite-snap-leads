import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PropertyContactChips } from "./PropertyContactChips";
import { usePropertyContacts } from "@/hooks/usePropertyContacts";
import { SkipTraceChip } from "./SkipTraceChip";

interface PropertyCardProps {
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    snap_score: number | null;
    snap_insight: string | null;
    updated_at: string | null;
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClick: () => void;
}

export function PropertyCard({
  property,
  isSelected,
  onToggleSelect,
  onClick
}: PropertyCardProps) {
  const { data: contacts = [] } = usePropertyContacts(property.id);
  
  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 80) return "bg-destructive";
    if (score >= 60) return "bg-orange-500";
    return "bg-primary";
  };

  const lastSeen = property.updated_at
    ? formatDistanceToNow(new Date(property.updated_at), { addSuffix: false })
    : "Unknown";

  const hasPhone = contacts.some(c => c.phone);
  const hasEmail = contacts.some(c => c.email);

  return (
    <div
      className="group p-4 border-b hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(property.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1">
              <h3 className="font-semibold text-base">
                {property.address}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <SkipTraceChip
                phoneCount={contacts.filter(c => c.phone).length}
                emailCount={contacts.filter(c => c.email).length}
              />
              <Badge
                className={`${getScoreColor(property.snap_score)} text-white shrink-0`}
              >
                {property.snap_score || 0}
              </Badge>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-2">
            {property.snap_insight || "No insight available"}
          </p>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-primary -ml-2"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Implement text owner action
              }}
            >
              <MessageSquare className="h-4 w-4" />
              Text owner
            </Button>

            <span className="text-xs text-muted-foreground">
              {lastSeen}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
