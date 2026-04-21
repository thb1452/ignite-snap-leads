import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLeadActivities, useAddLeadNote } from "@/hooks/useLeads";
import {
  ArrowRightLeft,
  StickyNote,
  Phone,
  MessageSquare,
  Mail,
  Activity as ActivityIcon,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  leadId: string;
}

const ACTIVITY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  stage_change: ArrowRightLeft,
  call: Phone,
  sms: MessageSquare,
  email: Mail,
  distress_event: ActivityIcon,
};

export function LeadActivityTimeline({ leadId }: Props) {
  const [note, setNote] = useState("");
  const { data: activities, isLoading } = useLeadActivities(leadId);
  const { mutate: addNote, isPending } = useAddLeadNote();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    addNote(
      { leadId, note: note.trim() },
      { onSuccess: () => setNote("") },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about this lead…"
            rows={3}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending || !note.trim()}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add note
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : !activities || activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet. Add a note above to start a record.
            </p>
          ) : (
            activities.map((a) => {
              const Icon = ACTIVITY_ICON[a.activity_type] ?? ActivityIcon;
              const payload = a.payload as Record<string, unknown>;
              const isDistress = a.activity_type === "distress_event";
              return (
                <div
                  key={a.id}
                  className={`flex gap-3 border-l-2 pl-3 pb-1 ${
                    isDistress ? "border-destructive/40" : "border-border"
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon
                      className={`h-4 w-4 ${
                        isDistress ? "text-destructive" : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={isDistress ? "destructive" : "secondary"}
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {a.activity_type.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {a.activity_type === "note" && typeof payload?.note === "string" && (
                      <p className="text-sm mt-1 whitespace-pre-wrap">{payload.note as string}</p>
                    )}
                    {a.activity_type === "stage_change" && (
                      <p className="text-sm mt-1 text-muted-foreground">
                        Moved between stages
                      </p>
                    )}
                    {isDistress && (
                      <p className="text-sm mt-1">
                        {(payload.event_type as string)?.replace("_", " ")}
                        {payload.severity ? ` — ${payload.severity}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
