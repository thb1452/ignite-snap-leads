import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell } from 'lucide-react';
import { useEmailPreferences } from '@/hooks/useEmailPreferences';
import { Skeleton } from '@/components/ui/skeleton';

export function NotificationsSection() {
  const { preferences, isLoading, updatePreferences } = useEmailPreferences();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const handleDigestToggle = (enabled: boolean) => {
    updatePreferences.mutate({ weekly_digest_enabled: enabled });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>
          Manage your email preferences and alerts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Notifications */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground">Email Notifications</h4>
          
          {/* Weekly Digest */}
          <div className="flex items-start justify-between gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="weekly-digest" className="font-medium">
                Weekly Intelligence Digest
              </Label>
              <p className="text-sm text-muted-foreground">
                Get a weekly summary of new violations and hot properties
              </p>
            </div>
            <Switch
              id="weekly-digest"
              checked={preferences.weekly_digest_enabled}
              onCheckedChange={handleDigestToggle}
              disabled={updatePreferences.isPending}
            />
          </div>

          {/* Escalation Alerts */}
          <div className="flex items-start justify-between gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="escalation-alerts" className="font-medium">
                Real-time Escalation Alerts
              </Label>
              <p className="text-sm text-muted-foreground">
                Get notified when new violations are filed on properties you've saved
              </p>
            </div>
            <Switch
              id="escalation-alerts"
              checked={preferences.escalation_alerts_enabled}
              onCheckedChange={(enabled) =>
                updatePreferences.mutate({ escalation_alerts_enabled: enabled })
              }
              disabled={updatePreferences.isPending}
            />
          </div>
        </div>

        {/* Schedule (only when enabled) */}
        {preferences.weekly_digest_enabled && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium text-sm text-muted-foreground">Digest Schedule</h4>
            <p className="text-sm text-muted-foreground">
              Your digest is sent every Monday at 8:00 AM Eastern Time (ET).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
