import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLeadActivities, useAddLeadNote } from "@/hooks/useLeads";
import { privateActivities } from '@/services/receiptCases';
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
  const { data: activities, isLoading, isError, refetch } = useLeadActivities(leadId);
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
            maxLength={4000}
            aria-label="Private lead note"
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
          {isError ? (<div role="alert"><p className="text-sm">Activity could not be loaded.</p><Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button></div>) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          ) : !activities || activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet. Add a note above to start a record.
            </p>
          ) : (
            privateActivities(activities).map((a) => {
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
                    {['task', 'system', 'call', 'email'].includes(a.activity_type) && (<div className="text-sm mt-1 space-y-1">
                      {typeof payload.outcome === 'string' && <p className="font-medium">{payload.outcome.replace(/_/g, ' ')}</p>}
                      {typeof payload.description === 'string' && <p>{payload.description}</p>}
                      {typeof payload.note === 'string' && <p className="whitespace-pre-wrap">{payload.note}</p>}
                      {typeof payload.completed_action === 'string' && <p>Completed: {payload.completed_action}</p>}
                      {typeof payload.next_action === 'string' && <p>Next: {payload.next_action}{typeof payload.due_at === 'string' ? ` · ${new Date(payload.due_at).toLocaleString()}` : ''}</p>}
                    </div>)}
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
