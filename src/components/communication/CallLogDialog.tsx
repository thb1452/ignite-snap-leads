import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const CALL_STATUS_OPTIONS = ["completed", "missed", "voicemail", "busy"] as const;

export function CallLogDialog({ open, onOpenChange, propertyId, phoneNumber = "" }: CallLogDialogProps) {
  const [phone, setPhone] = useState(phoneNumber);
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSaveCallLog = async () => {
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
          description: "You must be logged in",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("call_logs").insert({
        user_id: user.id,
        property_id: propertyId,
        phone_number: phone,
        duration: duration ? parseInt(duration) : null,
        call_type: "outbound",
        status,
        notes: notes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Call logged successfully",
      });

      setPhone(phoneNumber);
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
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(555) 123-4567"
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
                {CALL_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
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
              placeholder="Call notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleSaveCallLog}
            disabled={loading || !phone || !status}
            className="w-full"
          >
            {loading ? "Saving..." : "Save Call Log"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
