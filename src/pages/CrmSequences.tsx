import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { SEOHead } from "@/components/SEOHead";
import { useDripSequences, useDripSteps, type DripSequence } from "@/hooks/useSms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, MessageSquare, Clock, Power, PowerOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function CrmSequences() {
  const { data: sequences = [], isLoading } = useDripSequences();
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <AppLayout>
      <SEOHead title="Drip Sequences | Snap Ignite" description="Build SMS drip campaigns for your leads." canonical="/crm/sequences" />
      <PageHeader
        title="Drip Sequences"
        description="Build multi-step SMS sequences. Manual enrollment from any lead."
        actions={<NewSequenceDialog />}
      />

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        {/* Sequence list */}
        <div className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && sequences.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No sequences yet. Create your first one to start nurturing leads.
              </CardContent>
            </Card>
          )}
          {sequences.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                activeId === s.id ? "border-primary bg-muted/40" : "border-border bg-card hover:bg-muted/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                {s.is_active ? (
                  <Badge variant="default" className="h-5 text-[10px]">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="h-5 text-[10px]">Paused</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 capitalize">{s.trigger_type.replace("_", " ")} trigger</div>
            </button>
          ))}
        </div>

        {/* Step editor */}
        <div>
          {activeId ? (
            <SequenceEditor sequence={sequences.find((s) => s.id === activeId)!} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Select a sequence to view and edit its steps.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function NewSequenceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data: profile } = await supabase
        .from("profiles").select("org_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      if (!profile?.org_id) throw new Error("No org");
      const { error } = await supabase.from("drip_sequences" as any).insert({
        org_id: profile.org_id, name: name.trim(), description: description.trim() || null,
        trigger_type: "manual", is_active: true,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["drip_sequences"] });
      setOpen(false);
      setName("");
      setDescription("");
      toast({ title: "Sequence created" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Sequence</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Drip Sequence</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pre-foreclosure cadence" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this sequence does…" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={busy || !name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SequenceEditor({ sequence }: { sequence: DripSequence }) {
  const { data: steps = [], refetch } = useDripSteps(sequence.id);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function addStep() {
    setBusy(true);
    try {
      const nextOrder = steps.length;
      const { error } = await supabase.from("drip_steps" as any).insert({
        sequence_id: sequence.id,
        step_order: nextOrder,
        delay_hours: nextOrder === 0 ? 0 : 24,
        channel: "sms",
        template_body: "Hi {{owner_name}}, regarding {{property_address}}…",
      });
      if (error) throw error;
      await refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function updateStep(stepId: string, patch: Record<string, unknown>) {
    await supabase.from("drip_steps" as any).update(patch).eq("id", stepId);
    refetch();
  }

  async function deleteStep(stepId: string) {
    await supabase.from("drip_steps" as any).delete().eq("id", stepId);
    refetch();
  }

  async function toggleActive() {
    await supabase.from("drip_sequences" as any).update({ is_active: !sequence.is_active }).eq("id", sequence.id);
    qc.invalidateQueries({ queryKey: ["drip_sequences"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">{sequence.name}</CardTitle>
          {sequence.description && <p className="text-sm text-muted-foreground mt-1">{sequence.description}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={toggleActive}>
          {sequence.is_active ? <><PowerOff className="h-4 w-4 mr-1" />Pause</> : <><Power className="h-4 w-4 mr-1" />Activate</>}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">No steps yet. Add the first SMS.</div>
        )}
        {steps.map((step, i) => (
          <div key={step.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="rounded-full">Step {i + 1}</Badge>
              <Clock className="h-3 w-3" />
              <Input
                type="number"
                min="0"
                value={step.delay_hours}
                onChange={(e) => updateStep(step.id, { delay_hours: parseInt(e.target.value) || 0 })}
                className="h-7 w-20 text-xs"
              />
              <span>hours after previous</span>
              <MessageSquare className="h-3 w-3 ml-2" />
              <span className="capitalize">{step.channel}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => deleteStep(step.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              value={step.template_body}
              onChange={(e) => updateStep(step.id, { template_body: e.target.value })}
              className="min-h-[80px] text-sm"
              placeholder="SMS body. Variables: {{owner_name}}, {{property_address}}"
            />
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addStep} disabled={busy} className="w-full">
          <Plus className="h-4 w-4 mr-1" />Add step
        </Button>
      </CardContent>
    </Card>
  );
}
