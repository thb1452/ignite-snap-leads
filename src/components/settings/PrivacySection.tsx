import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Download, Trash2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function PrivacySection() {
  const { toast } = useToast();

  const handleDownloadData = () => {
    toast({
      title: "Data Export Requested",
      description: "We'll email you a link to download your data within 24 hours.",
    });
  };

  const handleDeleteAccount = () => {
    toast({
      title: "Contact Support",
      description: "To delete your account, please email support@snapignite.com",
      variant: "destructive",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Privacy & Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDownloadData}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download My Data
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            className="gap-2 text-destructive border-destructive/50 hover:bg-destructive/10"
            onClick={handleDeleteAccount}
          >
            <Trash2 className="h-4 w-4" />
            Delete Account
          </Button>
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <FileText className="h-4 w-4 inline mr-1" />
            <strong>About SnapScore & SnapInsight:</strong> These are AI-generated estimates based solely on public code enforcement data.
            They are provided for informational purposes only and are not credit scores, financial advice,
            or a guarantee of any outcome.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
