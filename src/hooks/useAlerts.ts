import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { useAuth } from './use-auth';

export interface UserAlert {
  id: string;
  user_id: string;
  property_id: string | null;
  alert_type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  properties?: { address: string; city: string; state: string } | null;
}

const QUERY_KEY = 'user-alerts';

export function useAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch recent alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('user_alerts')
        .select('*, properties(address, city, state)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as UserAlert[];
    },
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute - alerts don't need to be super fresh
    gcTime: 5 * 60 * 1000, // 5 minutes - keep cached data longer
  });

  const unreadCount = alerts.filter((a) => !a.is_read).length;

  // Mark single alert as read
  const markRead = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await (supabase as any)
        .from('user_alerts')
        .update({ is_read: true })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user?.id] });
    },
  });

  // Mark all as read
  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await (supabase as any)
        .from('user_alerts')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user?.id] });
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_alerts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return {
    alerts,
    unreadCount,
    isLoading,
    markRead: useCallback((id: string) => markRead.mutate(id), [markRead]),
    markAllRead: useCallback(() => markAllRead.mutate(), [markAllRead]),
  };
}
