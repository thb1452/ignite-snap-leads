import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Clock, Calendar } from 'lucide-react';
import { useEmailPreferences, DAYS_OF_WEEK, TIMEZONES } from '@/hooks/useEmailPreferences';
import { Skeleton } from '@/components/ui/skeleton';

export function EmailPreferencesCard() {
  const { preferences, isLoading, updatePreferences } = useEmailPreferences();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
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

  // Generate hour options (12-hour format)
  const hourOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 6, // Start at 6 AM
    label: `${i + 6 > 12 ? i - 6 : i + 6}:00 ${i + 6 >= 12 ? 'PM' : 'AM'}`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Mail className="h-5 w-5" />
          <span>Email Notifications</span>
        </CardTitle>
        <CardDescription>
          Manage your weekly intelligence digest and notification preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Weekly Digest Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="weekly-digest">Weekly Intelligence Digest</Label>
            <p className="text-sm text-muted-foreground">
              Receive a weekly summary of new violations, hot properties, and insights
            </p>
          </div>
          <Switch
            id="weekly-digest"
            checked={preferences.weekly_digest_enabled}
            onCheckedChange={handleDigestToggle}
            disabled={updatePreferences.isPending}
          />
        </div>

        {/* Day and Time Selection (only show when enabled) */}
        {preferences.weekly_digest_enabled && (
          <div className="space-y-4 pt-2 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Day Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
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

              {/* Hour Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
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

              {/* Timezone Selection */}
              <div className="space-y-2">
                <Label>Timezone</Label>
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
