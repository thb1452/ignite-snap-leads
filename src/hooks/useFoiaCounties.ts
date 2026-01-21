import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

export interface County {
  id: string;
  county_name: string;
  state: string;
  foia_status: string | null;
  foia_portal_url: string | null;
  portal_type: string | null;
  assigned_to: string | null;
  last_request_date: string | null;
  last_upload_date: string | null;
  notes: string | null;
  list_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CountyWithStats extends County {
  request_count?: number;
  days_since_update?: number;
  priority_score?: number;
}

export function useFoiaCounties(filters?: {
  status?: string;
  state?: string;
  assignedOnly?: boolean;
  search?: string;
}) {
  const { user, isAdmin } = useAuth();
  
  return useQuery({
    queryKey: ['foia-counties', user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from('counties')
        .select('*');
      
      // VAs only see their assigned counties
      if (filters?.assignedOnly && user && !isAdmin) {
        query = query.eq('assigned_to', user.id);
      }
      
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('foia_status', filters.status);
      }
      
      if (filters?.state && filters.state !== 'all') {
        query = query.eq('state', filters.state);
      }
      
      if (filters?.search) {
        query = query.ilike('county_name', `%${filters.search}%`);
      }
      
      const { data, error } = await query.order('county_name');
      
      if (error) throw error;
      
      // Calculate priority scores
      const countiesWithStats: CountyWithStats[] = (data || []).map(county => {
        const lastUpdate = county.last_upload_date ? new Date(county.last_upload_date) : null;
        const daysSinceUpdate = lastUpdate 
          ? Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        
        return {
          ...county,
          days_since_update: daysSinceUpdate,
          priority_score: daysSinceUpdate * 10,
        };
      });
      
      return countiesWithStats;
    },
    enabled: !!user,
  });
}

export function useCounty(countyId: string) {
  return useQuery({
    queryKey: ['county', countyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counties')
        .select('*')
        .eq('id', countyId)
        .single();
      
      if (error) throw error;
      return data as County;
    },
    enabled: !!countyId,
  });
}

export function useUpdateCounty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<County> }) => {
      const { data, error } = await supabase
        .from('counties')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['foia-counties'] });
      queryClient.invalidateQueries({ queryKey: ['county', data.id] });
      toast({ title: 'County updated', description: 'Changes saved successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useAssignCounty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ 
      countyIds, 
      vaId,
      skipLimitCheck = false 
    }: { 
      countyIds: string[]; 
      vaId: string | null;
      skipLimitCheck?: boolean;
    }) => {
      // Only check limits when assigning (not unassigning)
      if (vaId && !skipLimitCheck) {
        // Count how many NEW counties we're adding
        // (counties that don't already have an assigned_to value)
        const { data: currentlyUnassigned, error: checkError } = await supabase
          .from('counties')
          .select('id')
          .in('id', countyIds)
          .is('assigned_to', null);
        
        if (checkError) throw checkError;
        
        const newAssignments = currentlyUnassigned?.length || 0;
        
        if (newAssignments > 0) {
          // Check limit via RPC
          const { data: limitCheck, error: limitError } = await supabase
            .rpc('fn_check_county_limit', { p_amount: newAssignments });
          
          if (limitError) {
            // If the function doesn't exist, skip the check (graceful degradation)
            if (!limitError.message?.includes('function') && !limitError.message?.includes('does not exist')) {
              throw limitError;
            }
          }
          
          if (limitCheck && limitCheck.allowed === false) {
            throw new Error(limitCheck.message || 'County assignment limit reached. Please upgrade your plan.');
          }
        }
      }
      
      const { error } = await supabase
        .from('counties')
        .update({ assigned_to: vaId, updated_at: new Date().toISOString() })
        .in('id', countyIds);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foia-counties'] });
      queryClient.invalidateQueries({ queryKey: ['county-assignment-count'] });
      queryClient.invalidateQueries({ queryKey: ['va-list'] });
      toast({ title: 'Counties assigned', description: 'Assignment updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useVAStats() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['va-stats', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      // Get counties assigned to VA
      const { data: counties, error: countiesError } = await supabase
        .from('counties')
        .select('id')
        .eq('assigned_to', user.id);
      
      if (countiesError) throw countiesError;
      
      const countyCount = counties?.length || 0;
      
      // Get requests from last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const { data: recentRequests, error: requestsError } = await supabase
        .from('foia_requests')
        .select('id, status')
        .eq('requested_by', user.id)
        .gte('request_date', weekAgo.toISOString().split('T')[0]);
      
      if (requestsError) throw requestsError;
      
      // Get all requests for response rate
      const { data: allRequests, error: allError } = await supabase
        .from('foia_requests')
        .select('status')
        .eq('requested_by', user.id);
      
      if (allError) throw allError;
      
      const totalRequests = allRequests?.length || 0;
      const fulfilledRequests = allRequests?.filter(r => r.status === 'fulfilled').length || 0;
      const responseRate = totalRequests > 0 ? Math.round((fulfilledRequests / totalRequests) * 100) : 0;
      
      return {
        countiesAssigned: countyCount,
        requestsThisWeek: recentRequests?.length || 0,
        responseRate,
        totalRequests,
      };
    },
    enabled: !!user,
  });
}
