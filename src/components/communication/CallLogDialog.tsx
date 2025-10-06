import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CallLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  phoneNumber?: string;
}

const CALL_STATUSES = ["completed", "missed", "voicemail", "busy"] as const;

export function CallLogDialog({ open, onOpenChange, propertyId, phoneNumber }: CallLogDialogProps) {
  const [phone, setPhone] = useState(phoneNumber || "");
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLogCall = async () => {
    if (!phone || !status) {
      toast({
        title: "Error",
        description: "Phone number and status are required",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to log calls",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("call_logs").insert({
        user_id: user.id,
        property_id: propertyId,
        phone_number: phone,
        duration: duration ? parseInt(duration) : null,
        status,
        call_type: "outbound",
        notes: notes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Call logged successfully",
      });

      setPhone("");
      setDuration("");
      setStatus("");
      setNotes("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error logging call:", error);
      toast({
        title: "Error",
        description: "Failed to log call",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Call</DialogTitle>
          <DialogDescription>Record details about your call</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Call Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Select status..." />
              </SelectTrigger>
              <SelectContent>
                {CALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (seconds)</Label>
            <Input
              id="duration"
              type="number"
              placeholder="120"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about the call..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button onClick={handleLogCall} disabled={loading} className="w-full">
            {loading ? "Logging..." : "Log Call"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
