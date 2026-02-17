import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { useAuth } from '@/hooks/use-auth';
import { PlanUsageSection } from '@/components/settings/PlanUsageSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { AccountDetailsSection } from '@/components/settings/AccountDetailsSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { HelpSection } from '@/components/settings/HelpSection';

export function Settings() {
  const { user } = useAuth();

  // Fetch lists count
  const { data: listsCount = 0 } = useQuery({
    queryKey: ['lists-count', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('lead_lists')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // Fetch properties count (total in system)
  const { data: propertiesCount = 0 } = useQuery({
    queryKey: ['properties-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('properties')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    },
    enabled: !!user?.id,
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-6">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account, preferences, and subscription
        </p>
      </div>

      <div className="space-y-6">
        <PlanUsageSection 
          listsCount={listsCount} 
          propertiesCount={propertiesCount} 
        />
        <NotificationsSection />
        <AccountDetailsSection />
        <PrivacySection />
        <HelpSection />
      </div>
    </div>
  );
}
