import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailAddress?: string;
  propertyAddress?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
}

export function SendEmailDialog({ open, onOpenChange, emailAddress = "", propertyAddress = "" }: SendEmailDialogProps) {
  const [email, setEmail] = useState(emailAddress);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTemplates();
      setEmail(emailAddress);
    }
  }, [open, emailAddress]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("is_default", { ascending: false});

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching email templates:", error);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      let subj = template.subject.replace(/{address}/g, propertyAddress);
      let content = template.content;
      content = content.replace(/{address}/g, propertyAddress);
      content = content.replace(/{name}/g, "Property Owner");
      setSubject(subj);
      setMessage(content);
    }
  };

  const handleSendEmail = async () => {
    if (!email || !subject || !message) {
      toast({
        title: "Error",
        description: "Email, subject, and message are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    toast({
      title: "Email Not Implemented",
      description: "Email sending requires Resend integration. Email prepared for: " + email,
    });
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="owner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
            />
          </div>

          <Button
            onClick={handleSendEmail}
            disabled={loading || !email || !subject || !message}
            className="w-full"
          >
            {loading ? "Sending..." : "Send Email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
