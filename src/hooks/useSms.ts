import { useAuth } from "@/components/auth/AuthProvider";
import { assertCrmIdentity } from "@/services/leads";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface SmsThread {
  id: string;
  org_id: string;
  lead_id: string | null;
  property_id: string | null;
  from_number: string;
  to_number: string;
  status: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  updated_at: string;
}

export interface SmsMessage {
  id: string;
  thread_id: string;
  org_id: string;
  direction: "inbound" | "outbound";
  body: string;
  twilio_sid: string | null;
  status: string;
  error_code: string | null;
  cost_cents: number | null;
  drip_enrollment_id: string | null;
  sent_at: string;
}

export function useSmsThreads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sms_threads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      await assertCrmIdentity(user!.id);
      const { data, error } = await supabase
        .from("sms_threads" as any)
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      await assertCrmIdentity(user!.id);
      return (data ?? []) as unknown as SmsThread[];
    },
    refetchInterval: 30_000,
  });
}

export function useSmsMessages(threadId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!threadId || !user) return;
    const channel = supabase
      .channel(`sms_messages:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages", filter: `thread_id=eq.${threadId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["sms_messages", user?.id, threadId] });
          qc.invalidateQueries({ queryKey: ["sms_threads", user?.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, qc, user?.id]);

  return useQuery({
    queryKey: ["sms_messages", user?.id, threadId],
    enabled: !!user && !!threadId,
    queryFn: async () => {
      await assertCrmIdentity(user!.id);
      const { data, error } = await supabase
        .from("sms_messages" as any)
        .select("*")
        .eq("thread_id", threadId!)
        .order("sent_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      await assertCrmIdentity(user!.id);
      return (data ?? []) as unknown as SmsMessage[];
    },
  });
}

export async function sendSms(args: {
  to: string;
  body: string;
  lead_id?: string | null;
  property_id?: string | null;
  recipient_zip?: string | null;
  recipient_state?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke("send-sms-threaded", { body: args });
  if (error) throw error;
  return data;
}

export async function markThreadRead(threadId: string) {
  await supabase
    .from("sms_threads" as any)
    .update({ unread_count: 0 })
    .eq("id", threadId);
}

// Drip sequences
export interface DripSequence {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DripStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_hours: number;
  channel: string;
  template_body: string;
}

export function useDripSequences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drip_sequences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      await assertCrmIdentity(user!.id);
      const { data, error } = await supabase
        .from("drip_sequences" as any)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      await assertCrmIdentity(user!.id);
      return (data ?? []) as unknown as DripSequence[];
    },
  });
}

export function useDripSteps(sequenceId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["drip_steps", user?.id, sequenceId],
    enabled: !!user && !!sequenceId,
    queryFn: async () => {
      await assertCrmIdentity(user!.id);
      const { data, error } = await supabase
        .from("drip_steps" as any)
        .select("*")
        .eq("sequence_id", sequenceId!)
        .order("step_order", { ascending: true });
      if (error) throw error;
      await assertCrmIdentity(user!.id);
      return (data ?? []) as unknown as DripStep[];
    },
  });
}

export async function enrollLeadInSequence(args: { lead_id: string; sequence_id: string; to_number?: string }) {
  const { data, error } = await supabase.functions.invoke("drip-enroll", { body: args });
  if (error) throw error;
  return data;
}
