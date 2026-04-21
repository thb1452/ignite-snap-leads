import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { SEOHead } from "@/components/SEOHead";
import { useSmsThreads, useSmsMessages, sendSms, markThreadRead, type SmsThread } from "@/hooks/useSms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Send, MessageSquare, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function CrmInbox() {
  const { data: threads = [], isLoading } = useSmsThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);
  const { data: messages = [] } = useSmsMessages(activeId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-select first thread
  useEffect(() => {
    if (!activeId && threads.length > 0) setActiveId(threads[0].id);
  }, [threads, activeId]);

  // Mark read on open
  useEffect(() => {
    if (activeId && active && active.unread_count > 0) {
      markThreadRead(activeId);
    }
  }, [activeId, active]);

  // Scroll to latest
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  async function handleSend() {
    if (!active || !draft.trim()) return;
    setSending(true);
    try {
      await sendSms({
        to: active.to_number,
        body: draft.trim(),
        lead_id: active.lead_id,
        property_id: active.property_id,
      });
      setDraft("");
      toast({ title: "Message sent" });
    } catch (e: any) {
      toast({
        title: "Send failed",
        description: e?.message ?? "Check your Twilio integration.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AppLayout>
      <SEOHead title="SMS Inbox | Snap Ignite" description="Two-way SMS conversations with your leads." canonical="/crm/inbox" />
      <PageHeader title="SMS Inbox" description="Two-way SMS via your connected Twilio account." />

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Thread list */}
        <div className="rounded-lg border border-border bg-card flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Threads</span>
            <Badge variant="secondary" className="ml-auto">{threads.length}</Badge>
          </div>
          <ScrollArea className="flex-1">
            {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && threads.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No conversations yet. Send an SMS from a lead to start.
              </div>
            )}
            {threads.map((t) => (
              <ThreadRow key={t.id} thread={t} active={t.id === activeId} onClick={() => setActiveId(t.id)} />
            ))}
          </ScrollArea>
        </div>

        {/* Conversation */}
        <div className="rounded-lg border border-border bg-card flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a conversation to view messages.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border">
                <div className="font-medium text-sm">{active.to_number}</div>
                <div className="text-xs text-muted-foreground">From {active.from_number}</div>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                        m.direction === "outbound"
                          ? "bg-primary text-primary-foreground self-end rounded-br-sm"
                          : "bg-muted text-foreground self-start rounded-bl-sm",
                      )}
                    >
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className="text-[10px] opacity-70 mt-1">
                        {formatDistanceToNow(new Date(m.sent_at), { addSuffix: true })}
                        {m.status === "failed" && " · failed"}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <Separator />
              <div className="p-3 flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="min-h-[60px] resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
                  }}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()} size="icon" className="h-auto">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="px-3 pb-2 text-[10px] text-muted-foreground">
                Cmd/Ctrl+Enter to send · TCPA quiet hours and STOP keyword handling enforced
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function ThreadRow({ thread, active, onClick }: { thread: SmsThread; active: boolean; onClick: () => void }) {
  const lastTime = thread.last_inbound_at ?? thread.last_outbound_at ?? thread.updated_at;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/40 transition-colors",
        active && "bg-muted/60",
      )}
    >
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{thread.to_number}</span>
        {thread.unread_count > 0 && (
          <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">
            {thread.unread_count}
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate mt-1">
        {thread.last_message_preview ?? "No messages yet"}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        {formatDistanceToNow(new Date(lastTime), { addSuffix: true })}
      </div>
    </button>
  );
}
