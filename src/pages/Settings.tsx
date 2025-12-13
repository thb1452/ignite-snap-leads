import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, CreditCard, User, Crown, Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
import { SubscriptionSettings } from '@/components/subscription/SubscriptionSettings';
import { AppLayout } from '@/components/layout/AppLayout';

export function Settings() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'organization';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleBuyCredits = () => {
    toast({
      title: "Demo Feature",
      description: "Credit purchasing is not available in the demo version",
    });
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization and account settings
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="organization" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Organization</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              <span className="hidden sm:inline">Subscription</span>
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Credits</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
          </TabsList>

          {/* Subscription Tab */}
          <TabsContent value="subscription">
            <SubscriptionSettings />
          </TabsContent>

          {/* Organization Tab */}
          <TabsContent value="organization" className="space-y-6">
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

            {/* Legal Disclaimer */}
            <Card>
              <CardHeader>
                <CardTitle>About SnapScore & SnapInsight</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  SnapScore and SnapInsight are AI-generated estimates based solely on public code enforcement data.
                  They are provided for informational lead-prioritization only and are not credit scores, financial advice,
                  or a guarantee of motivation or sale. All scores and insights reflect property code violation patterns,
                  not personal information about property owners.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Credits Tab */}
          <TabsContent value="credits" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CreditCard className="h-5 w-5" />
                  <span>Skip Trace Credits</span>
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
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
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
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
