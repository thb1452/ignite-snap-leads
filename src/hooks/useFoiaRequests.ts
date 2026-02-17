import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

export interface FoiaRequest {
  id: string;
  county_id: string;
  requested_by: string;
  request_date: string;
  request_method: string | null;
  data_years_requested: string | null;
  status: string | null;
  response_date: string | null;
  invoice_amount: number | null;
  invoice_paid: boolean | null;
  notes: string | null;
  created_at: string | null;
}

export function useFoiaRequests(countyId?: string) {
  return useQuery({
    queryKey: ['foia-requests', countyId],
    queryFn: async () => {
      let query = supabase
        .from('foia_requests')
        .select('*')
        .order('request_date', { ascending: false });
      
      if (countyId) {
        query = query.eq('county_id', countyId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as FoiaRequest[];
    },
  });
}

export function useCreateFoiaRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (request: {
      county_id: string;
      request_date: string;
      request_method: string;
      data_years_requested: string;
      notes?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('foia_requests')
        .insert({
          ...request,
          requested_by: user.id,
          status: 'pending',
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update county status and last_request_date
      await supabase
        .from('counties')
        .update({ 
          foia_status: 'pending',
          last_request_date: request.request_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.county_id);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['foia-requests', data.county_id] });
      queryClient.invalidateQueries({ queryKey: ['foia-counties'] });
      queryClient.invalidateQueries({ queryKey: ['county', data.county_id] });
      queryClient.invalidateQueries({ queryKey: ['va-stats'] });
      toast({ title: 'Request logged', description: 'FOIA request has been recorded.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
