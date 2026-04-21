import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDripSequences, enrollLeadInSequence } from "@/hooks/useSms";
import { toast } from "@/hooks/use-toast";
import { Zap } from "lucide-react";

interface Props {
  leadId: string;
  defaultPhone?: string | null;
}

export function EnrollInSequenceButton({ leadId, defaultPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [sequenceId, setSequenceId] = useState<string>("");
  const [phone, setPhone] = useState<string>(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);
  const { data: sequences = [] } = useDripSequences();
  const activeSequences = sequences.filter((s) => s.is_active);

  async function handleEnroll() {
    if (!sequenceId) return;
    setBusy(true);
    try {
      const result = await enrollLeadInSequence({
        lead_id: leadId,
        sequence_id: sequenceId,
        to_number: phone || undefined,
      });
      toast({
        title: "Enrolled",
        description: `First message will send shortly.`,
      });
      setOpen(false);
    } catch (e: any) {
      const msg = e?.message ?? "Enrollment failed";
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Zap className="h-4 w-4 mr-1" />
          Enroll in Sequence
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll Lead in Drip Sequence</DialogTitle>
          <DialogDescription>
            The first SMS sends immediately, subsequent steps follow each step's delay.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Sequence</Label>
            <Select value={sequenceId} onValueChange={setSequenceId}>
              <SelectTrigger><SelectValue placeholder="Choose a sequence…" /></SelectTrigger>
              <SelectContent>
                {activeSequences.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No active sequences. Create one in /crm/sequences.</div>
                )}
                {activeSequences.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Phone number (E.164)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave blank to use the lead's owner phone on file.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleEnroll} disabled={busy || !sequenceId}>
            {busy ? "Enrolling…" : "Enroll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
