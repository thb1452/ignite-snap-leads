import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, CreditCard, User, Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function Settings() {
  const { toast } = useToast();

  const handleBuyCredits = () => {
    toast({
      title: "Demo Feature",
      description: "Credit purchasing is not available in the demo version",
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your organization and account settings
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>Organization</span>
            </CardTitle>
            <CardDescription>
              Your organization details and settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Organization Name</label>
              <p className="text-lg font-semibold">Demo Organization</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Plan</label>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="default">Demo</Badge>
                <span className="text-sm text-muted-foreground">Full feature access</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Organization ID</label>
              <p className="text-sm text-muted-foreground font-mono">demo-org-001</p>
            </div>
          </CardContent>
        </Card>

        {/* Credits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <span>Credits</span>
            </CardTitle>
            <CardDescription>
              Manage your skip trace credits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Available Credits</label>
              <div className="flex items-center space-x-2 mt-1">
                <p className="text-3xl font-bold text-primary">100</p>
                <span className="text-sm text-muted-foreground">skip trace credits</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Credit Usage</label>
              <p className="text-sm text-muted-foreground">Each skip trace consumes 1 credit</p>
            </div>
            <Button onClick={handleBuyCredits} className="w-full">
              Buy More Credits
            </Button>
          </CardContent>
        </Card>

        {/* User Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>User Profile</span>
            </CardTitle>
            <CardDescription>
              Your account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="text-sm">demo@snapignite.com</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Full Name</label>
              <p className="text-sm">Demo User</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Role</label>
              <Badge variant="outline">Administrator</Badge>
            </div>
            <Button variant="outline" className="w-full" disabled>
              Edit Profile (Demo)
            </Button>
          </CardContent>
        </Card>

        {/* API & Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <SettingsIcon className="h-5 w-5" />
              <span>API & Integrations</span>
            </CardTitle>
            <CardDescription>
              Connect with external services
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Skip Trace Provider</label>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="outline">Demo API</Badge>
                <span className="text-sm text-muted-foreground">Connected</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Data Export</label>
              <p className="text-sm text-muted-foreground">CSV exports are automatically available</p>
            </div>
            <Button variant="outline" className="w-full" disabled>
              Manage Integrations (Demo)
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Usage Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Statistics</CardTitle>
          <CardDescription>
            Your activity in the past 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">3</p>
              <p className="text-sm text-muted-foreground">CSV Uploads</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">150</p>
              <p className="text-sm text-muted-foreground">Violations Processed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">25</p>
              <p className="text-sm text-muted-foreground">Skip Traces Run</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">12</p>
              <p className="text-sm text-muted-foreground">Exports Generated</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}