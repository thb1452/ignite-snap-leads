import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { useAuth } from './use-auth';

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const QUERY_KEY = 'app-notifications';

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user?.id] }),
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-rt')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead: useCallback((id: string) => markRead.mutate(id), [markRead]),
    markAllRead: useCallback(() => markAllRead.mutate(), [markAllRead]),
  };
}
