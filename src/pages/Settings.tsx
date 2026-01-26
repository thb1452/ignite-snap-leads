import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Crown, User, Bell, FileText, Loader2, Mail, Key } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { SubscriptionSettings } from '@/components/subscription/SubscriptionSettings';
import { EmailPreferencesCard } from '@/components/settings/EmailPreferencesCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { useProfileSettings } from '@/hooks/useProfileSettings';
import { Skeleton } from '@/components/ui/skeleton';

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, organization, isLoading, updateProfile, requestPasswordReset } = useProfileSettings();
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const activeTab = searchParams.get('tab') || 'account';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleEditName = () => {
    setNewName(profile?.full_name || '');
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (newName.trim()) {
      updateProfile.mutate({ full_name: newName.trim() });
    }
    setIsEditingName(false);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setNewName('');
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your account and preferences
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="account" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
            <TabsTrigger value="organization" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Organization</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              <span className="hidden sm:inline">Subscription</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile
                </CardTitle>
                <CardDescription>
                  Your personal account information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        Email
                      </Label>
                      <p className="text-sm px-3 py-2 bg-muted rounded-md">
                        {profile?.email || 'Not available'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      {isEditingName ? (
                        <div className="flex gap-2">
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Enter your name"
                            className="flex-1"
                          />
                          <Button 
                            size="sm" 
                            onClick={handleSaveName}
                            disabled={updateProfile.isPending}
                          >
                            {updateProfile.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Save'
                            )}
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm px-3 py-2 bg-muted rounded-md flex-1">
                            {profile?.full_name || 'Not set'}
                          </p>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleEditName}
                            className="ml-2"
                          >
                            Edit
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Account Status</Label>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Active
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Member since {profile?.created_at 
                            ? new Date(profile.created_at).toLocaleDateString() 
                            : 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Security Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Security
                </CardTitle>
                <CardDescription>
                  Manage your account security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Password</Label>
                  <p className="text-sm text-muted-foreground">
                    ••••••••••••
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => requestPasswordReset.mutate()}
                  disabled={requestPasswordReset.isPending}
                >
                  {requestPasswordReset.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending Reset Email...
                    </>
                  ) : (
                    'Request Password Reset'
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Organization Tab */}
          <TabsContent value="organization" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organization Details
                </CardTitle>
                <CardDescription>
                  Your organization information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-6 w-48" />
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Organization Name</Label>
                      <p className="text-lg font-semibold">
                        {organization?.name || 'Personal Account'}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Organization ID</Label>
                      <p className="text-sm text-muted-foreground font-mono">
                        {organization?.id?.slice(0, 8) || 'N/A'}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Data Export Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Data Export
                </CardTitle>
                <CardDescription>
                  Export capabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  CSV exports are available from the Properties page. Select properties and use the export button to download your data.
                </p>
              </CardContent>
            </Card>

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

          {/* Subscription Tab */}
          <TabsContent value="subscription">
            <SubscriptionSettings />
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <EmailPreferencesCard />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
