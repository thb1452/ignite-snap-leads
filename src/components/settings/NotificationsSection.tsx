import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Clock, Calendar } from 'lucide-react';
import { useEmailPreferences, DAYS_OF_WEEK, TIMEZONES } from '@/hooks/useEmailPreferences';
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

  const handleDayChange = (day: string) => {
    updatePreferences.mutate({ digest_day: parseInt(day) });
  };

  const handleHourChange = (hour: string) => {
    updatePreferences.mutate({ digest_hour: parseInt(hour) });
  };

  const handleTimezoneChange = (timezone: string) => {
    updatePreferences.mutate({ timezone });
  };

  const hourOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 6,
    label: `${i + 6 > 12 ? i - 6 : i + 6}:00 ${i + 6 >= 12 ? 'PM' : 'AM'}`,
  }));

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
                Get a weekly summary of fresh enforcement actions and high-pressure properties to review
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Day
                </Label>
                <Select
                  value={preferences.digest_day.toString()}
                  onValueChange={handleDayChange}
                  disabled={updatePreferences.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={day.value.toString()}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Time
                </Label>
                <Select
                  value={preferences.digest_hour.toString()}
                  onValueChange={handleHourChange}
                  disabled={updatePreferences.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hourOptions.map((hour) => (
                      <SelectItem key={hour.value} value={hour.value.toString()}>
                        {hour.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Timezone</Label>
                <Select
                  value={preferences.timezone}
                  onValueChange={handleTimezoneChange}
                  disabled={updatePreferences.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your digest will be sent every {DAYS_OF_WEEK.find(d => d.value === preferences.digest_day)?.label || 'Monday'} at{' '}
              {preferences.digest_hour > 12 ? preferences.digest_hour - 12 : preferences.digest_hour}:00{' '}
              {preferences.digest_hour >= 12 ? 'PM' : 'AM'}{' '}
              {TIMEZONES.find(tz => tz.value === preferences.timezone)?.label || 'ET'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
