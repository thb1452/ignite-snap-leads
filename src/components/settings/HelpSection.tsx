import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { HelpCircle, Mail, MessageSquare, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/externalClient';
import { useToast } from '@/hooks/use-toast';

type ModalType = 'support' | 'feature' | null;

export function HelpSection() {
  const [modalType, setModalType] = useState<ModalType>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const isSupport = modalType === 'support';

  async function handleSubmit() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-support-message', {
        body: { message: message.trim(), type: modalType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: isSupport ? 'Message Sent' : 'Feature Request Sent',
        description: "We'll get back to you shortly.",
      });
      setMessage('');
      setModalType(null);
    } catch (err: any) {
      toast({
        title: 'Failed to Send',
        description: err.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Need Help?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="justify-start gap-2 h-auto py-3"
              onClick={() => setModalType('support')}
            >
              <Mail className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium">Contact Support</p>
                <p className="text-xs text-muted-foreground">Get help from our team</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="justify-start gap-2 h-auto py-3"
              onClick={() => setModalType('feature')}
            >
              <MessageSquare className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium">Request Feature</p>
                <p className="text-xs text-muted-foreground">Share your ideas</p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalType !== null} onOpenChange={(open) => { if (!open) { setModalType(null); setMessage(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isSupport ? 'Contact Support' : 'Request a Feature'}</DialogTitle>
            <DialogDescription>
              {isSupport
                ? 'Describe your issue and we\'ll get back to you via email.'
                : 'Tell us what feature you\'d like to see.'}
              {' '}Your name, email, and plan are included automatically.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder={isSupport ? 'Describe your issue...' : 'Describe the feature you\'d like...'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={5000}
            className="resize-none"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalType(null); setMessage(''); }} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={sending || !message.trim()}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
