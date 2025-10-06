import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SendSMSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber?: string;
  propertyAddress?: string;
}

interface SMSTemplate {
  id: string;
  name: string;
  content: string;
}

export function SendSMSDialog({ open, onOpenChange, phoneNumber = "", propertyAddress = "" }: SendSMSDialogProps) {
  const [phone, setPhone] = useState(phoneNumber);
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTemplates();
      setPhone(phoneNumber);
    }
  }, [open, phoneNumber]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("sms_templates")
        .select("*")
        .order("is_default", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching SMS templates:", error);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      let content = template.content;
      content = content.replace(/{address}/g, propertyAddress);
      content = content.replace(/{name}/g, "Property Owner");
      setMessage(content);
    }
  };

  const handleSendSMS = async () => {
    if (!phone || !message) {
      toast({
        title: "Error",
        description: "Phone number and message are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    toast({
      title: "SMS Not Implemented",
      description: "SMS sending requires Twilio integration. Message prepared for: " + phone,
    });
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send SMS</DialogTitle>
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
            <Label htmlFor="template">Template</Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Select a template..." />
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
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              {message.length} characters
            </p>
          </div>

          <Button
            onClick={handleSendSMS}
            disabled={loading || !phone || !message}
            className="w-full"
          >
            {loading ? "Sending..." : "Send SMS"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
