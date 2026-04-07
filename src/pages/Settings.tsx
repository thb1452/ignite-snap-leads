import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { PlanUsageSection } from '@/components/settings/PlanUsageSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { AccountDetailsSection } from '@/components/settings/AccountDetailsSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { HelpSection } from '@/components/settings/HelpSection';
import { clearPendingStripeCheckout, getPendingStripeCheckout } from '@/utils/pendingStripeCheckout';

export function Settings() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const planSectionRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Handle ?credits_added=N param set by Stripe success_url redirect.
  // Invalidate the credit cache immediately so the UI reflects the purchase
  // without waiting for the staleTime to expire.
  useEffect(() => {
    const creditsAdded = searchParams.get('credits_added');
    if (!creditsAdded) return;

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['credits'] }),
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] }),
    ]);

    toast({
      title: 'Payment received',
      description: `Finalizing your ${Number(creditsAdded).toLocaleString()} bulk credits — they'll appear here shortly.`,
    });

    const newParams = new URLSearchParams(searchParams);
    newParams.delete('credits_added');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams, queryClient, toast]);

  // Sync subscription/bulk credit state when returning from Stripe checkout
  useEffect(() => {
    const handleFocus = async () => {
      if (!user?.id) return;
      const pending = getPendingStripeCheckout();
      if (!pending) return;

      let synced = false;

      if (pending.type === "subscription") {
        try {
          const { data } = await supabase.functions.invoke("verify-subscription", { method: "POST", body: {} });
          synced = !!data?.synced;
        } catch (e) {
          console.error("[Settings] verify-subscription error:", e);
        }
      }

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["subscription", user.id] }),
        queryClient.refetchQueries({ queryKey: ["subscription-usage", user.id] }),
        queryClient.refetchQueries({ queryKey: ["credits", "balance"] }),
        queryClient.refetchQueries({ queryKey: ["user", "credits"] }),
        queryClient.refetchQueries({ queryKey: ["free-unlocks"] }),
      ]);

      if (pending.type === "subscription") {
        const currentSubscription = queryClient.getQueryData<{ plan_name?: string }>(["subscription", user.id]);
        if (pending.expectedTier) {
          synced = currentSubscription?.plan_name === pending.expectedTier;
        } else {
          synced = synced || !!currentSubscription?.plan_name;
        }
      } else {
        // For bulk credits, check that balance increased by at least the expected amount
        const currentBalance = Number(queryClient.getQueryData<number>(["credits", "balance"]) ?? 0);
        synced = pending.expectedBalance != null
          ? currentBalance >= pending.expectedBalance
          : currentBalance > 0;
      }

      if (!synced) return;

      clearPendingStripeCheckout();

      toast({
        title: pending.type === "subscription" ? "Subscription activated!" : "Credits added!",
        description: pending.type === "subscription"
          ? "Your plan is now active."
          : "Your bulk credits are now available.",
      });
    };

    window.addEventListener("focus", handleFocus);
    handleFocus();
    return () => window.removeEventListener("focus", handleFocus);
  }, [user?.id, queryClient, toast]);

  useEffect(() => {
    if (searchParams.get('tab') === 'subscription' && planSectionRef.current) {
      planSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams]);

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
        <div ref={planSectionRef}>
          <PlanUsageSection
            listsCount={listsCount}
            propertiesCount={propertiesCount}
          />
        </div>
        <NotificationsSection />
        <AccountDetailsSection />
        <PrivacySection />
        <HelpSection />
      </div>
    </div>
  );
}
