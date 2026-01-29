import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HelpCircle, Mail, FileText, MessageSquare, ExternalLink } from 'lucide-react';

export function HelpSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5" />
          Need Help?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Button 
            variant="outline" 
            className="justify-start gap-2 h-auto py-3"
            asChild
          >
            <a href="mailto:support@snapignite.com">
              <Mail className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium">Contact Support</p>
                <p className="text-xs text-muted-foreground">support@snapignite.com</p>
              </div>
            </a>
          </Button>
          
          <Button 
            variant="outline" 
            className="justify-start gap-2 h-auto py-3"
            asChild
          >
            <a href="https://docs.snapignite.com" target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium">Documentation</p>
                <p className="text-xs text-muted-foreground">Guides & tutorials</p>
              </div>
              <ExternalLink className="h-3 w-3 ml-auto" />
            </a>
          </Button>
          
          <Button 
            variant="outline" 
            className="justify-start gap-2 h-auto py-3"
            asChild
          >
            <a href="mailto:feedback@snapignite.com?subject=Feature Request">
              <MessageSquare className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium">Request Feature</p>
                <p className="text-xs text-muted-foreground">Share your ideas</p>
              </div>
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
