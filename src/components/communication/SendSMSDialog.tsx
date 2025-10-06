import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SendSMSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyAddress: string;
  ownerName?: string;
  phoneNumber?: string;
}

interface SMSTemplate {
  id: string;
  name: string;
  content: string;
}

export function SendSMSDialog({ 
  open, 
  onOpenChange, 
  propertyAddress,
  ownerName,
  phoneNumber 
}: SendSMSDialogProps) {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("sms_templates")
        .select("*")
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching SMS templates:", error);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      let content = template.content;
      content = content.replace("{name}", ownerName || "Owner");
      content = content.replace("{address}", propertyAddress);
      setMessage(content);
    }
  };

  const handleSendSMS = async () => {
    if (!phoneNumber) {
      toast({
        title: "No Phone Number",
        description: "Please run skip trace to get the owner's phone number first",
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    toast({
      title: "Coming Soon",
      description: "SMS sending will be available once you integrate with Twilio or similar service",
    });
    
    // TODO: Integrate with Twilio or similar SMS service
    // This would typically call an edge function that handles the SMS API
    
    setTimeout(() => {
      setLoading(false);
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send SMS</DialogTitle>
          <DialogDescription>
            Send a text message to the property owner
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template">Template</Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              {message.length} characters
            </p>
          </div>

          {phoneNumber ? (
            <p className="text-sm text-muted-foreground">
              Sending to: {phoneNumber}
            </p>
          ) : (
            <p className="text-sm text-destructive">
              No phone number available. Run skip trace first.
            </p>
          )}

          <Button 
            onClick={handleSendSMS} 
            disabled={loading || !phoneNumber} 
            className="w-full"
          >
            {loading ? "Sending..." : "Send SMS"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
