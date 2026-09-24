import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { assertCrmIdentity } from '@/services/leads';
import { crmKey } from '@/services/crmModel';
import { receiptCaseService, receiptKey, receiptIsCurrent, scheduleReceiptExpiry, visibleReceiptData, readReceiptWithoutFallback, evictReceiptSourceCache, type ReceiptRpc, type ReceiptAcceptance, type ReceiptHandoff } from '@/services/receiptCases';

export const receiptService = receiptCaseService(supabase as unknown as ReceiptRpc, assertCrmIdentity);
const options = {staleTime: 0, gcTime: 0, retry: false, refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const, refetchOnReconnect: 'always' as const, refetchInterval: 30000};

/** Evict only source caches; contacts, notes and edits remain in their CRM cache. */
export function useReceiptDeadline(deadline: string | undefined, actor: string | undefined) {
  const queryClient = useQueryClient();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!deadline || !actor) return;
    const expire = () => {
      evictReceiptSourceCache(queryClient, actor);
      tick(value => value + 1);
    };
    const cancel = scheduleReceiptExpiry(deadline, expire);
    const check = () => {if (!receiptIsCurrent(deadline)) expire();};
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {cancel(); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check);};
  }, [actor, deadline, queryClient]);
  return !deadline || receiptIsCurrent(deadline);
}
export function useReceiptAcceptances() {
  const {user, loading, authError} = useAuth();
  const query = useQuery({...options, queryKey: receiptKey(user?.id, 'acceptances'),
    queryFn: ({signal}) => readReceiptWithoutFallback(() => receiptService.acceptances(user!.id, signal)), enabled: !!user && !loading && !authError});
  const value = query.data?.ok ? query.data.value : undefined;
  const deadline = value?.map(row => row.valid_until).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  useReceiptDeadline(deadline, user?.id);
  const visible = visibleReceiptData({...query, data: value});
  return {...query, isError: query.isError || query.data?.ok === false, data: !user || loading || authError ? undefined : visible?.filter(row => receiptIsCurrent(row.valid_until))};
}
export function useReceiptProperties(acceptance: ReceiptAcceptance, offset: number) {
  const {user, loading, authError} = useAuth();
  const current = useReceiptDeadline(acceptance.valid_until, user?.id);
  const query = useQuery({...options, queryKey: receiptKey(user?.id, 'properties', acceptance.acceptance_id, offset),
    queryFn: ({signal}) => readReceiptWithoutFallback(() => receiptService.properties(user!.id, acceptance, offset, signal)), enabled: !!user && !loading && !authError && current});
  const value = query.data?.ok ? query.data.value : undefined;
  return {...query, isError: query.isError || query.data?.ok === false, data: !user || loading || authError ? undefined : visibleReceiptData({...query, data: value}, acceptance.valid_until), expired: !current};
}
export function useReceiptHandoff() {
  const {user} = useAuth();
  const queryClient = useQueryClient();
  return useMutation({retry: false,
    mutationFn: (command: ReceiptHandoff) => {
      if (!user) throw new Error('Sign in required.');
      return receiptService.handoff(user.id, command);
    },
    onSuccess: () => {void queryClient.invalidateQueries({queryKey: crmKey(user?.id)});},
  });
}

export const receiptQueryOptions = options;
