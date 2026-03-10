import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

export interface EmailPreferences {
  id: string;
  user_id: string;
  weekly_digest_enabled: boolean;
  digest_day: number;
  digest_hour: number;
  timezone: string;
  escalation_alerts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
];

export { DAYS_OF_WEEK, TIMEZONES };

export function useEmailPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading, error } = useQuery({
    queryKey: ['email-preferences', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('email_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as EmailPreferences | null;
    },
    enabled: !!user,
  });

  const updatePreferences = useMutation({
    mutationFn: async (updates: Partial<Omit<EmailPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) throw new Error('Not authenticated');

      // Check if preferences exist
      if (preferences) {
        // Update existing
        const { error } = await supabase
          .from('email_preferences')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('email_preferences')
          .insert({
            user_id: user.id,
            ...updates,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-preferences', user?.id] });
      toast({ title: 'Preferences saved', description: 'Your email preferences have been updated.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Default values if no preferences exist
  const effectivePreferences: Omit<EmailPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
    weekly_digest_enabled: preferences?.weekly_digest_enabled ?? true,
    digest_day: preferences?.digest_day ?? 1,
    digest_hour: preferences?.digest_hour ?? 8,
    timezone: preferences?.timezone ?? 'America/New_York',
    escalation_alerts_enabled: preferences?.escalation_alerts_enabled ?? true,
  };

  return {
    preferences: effectivePreferences,
    rawPreferences: preferences,
    isLoading,
    error,
    updatePreferences,
    DAYS_OF_WEEK,
    TIMEZONES,
  };
}
