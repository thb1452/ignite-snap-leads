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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyAddress: string;
  ownerName?: string;
  ownerEmail?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
}

export function SendEmailDialog({ 
  open, 
  onOpenChange, 
  propertyAddress,
  ownerName,
  ownerEmail 
}: SendEmailDialogProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [subject, setSubject] = useState("");
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
        .from("email_templates")
        .select("*")
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching email templates:", error);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      let templateSubject = template.subject;
      let content = template.content;
      
      templateSubject = templateSubject.replace("{address}", propertyAddress);
      content = content.replace("{name}", ownerName || "Owner");
      content = content.replace("{address}", propertyAddress);
      
      setSubject(templateSubject);
      setMessage(content);
    }
  };

  const handleSendEmail = async () => {
    if (!ownerEmail) {
      toast({
        title: "No Email Address",
        description: "Please run skip trace to get the owner's email address first",
        variant: "destructive",
      });
      return;
    }

    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Error",
        description: "Please enter a subject and message",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    toast({
      title: "Coming Soon",
      description: "Email sending will be available once you integrate with Resend or similar service",
    });
    
    // TODO: Integrate with Resend or similar email service
    // This would typically call an edge function that handles the email API
    
    setTimeout(() => {
      setLoading(false);
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
          <DialogDescription>
            Send an email to the property owner
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
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
            />
          </div>

          {ownerEmail ? (
            <p className="text-sm text-muted-foreground">
              Sending to: {ownerEmail}
            </p>
          ) : (
            <p className="text-sm text-destructive">
              No email address available. Run skip trace first.
            </p>
          )}

          <Button 
            onClick={handleSendEmail} 
            disabled={loading || !ownerEmail} 
            className="w-full"
          >
            {loading ? "Sending..." : "Send Email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
