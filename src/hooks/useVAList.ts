import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';

export interface VAUser {
  id: string;
  email: string;
  full_name: string | null;
  counties_count?: number;
}

export function useVAList() {
  return useQuery({
    queryKey: ['va-list'],
    queryFn: async () => {
      // Get all VAs from user_roles
      const { data: vaRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'va');
      
      if (rolesError) throw rolesError;
      
      const vaIds = vaRoles?.map(r => r.user_id) || [];
      
      if (vaIds.length === 0) return [];
      
      // Get profiles for VAs
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, full_name')
        .in('user_id', vaIds);
      
      if (profilesError) throw profilesError;
      
      // Get county counts per VA
      const { data: countyCounts, error: countyError } = await supabase
        .from('counties')
        .select('assigned_to')
        .in('assigned_to', vaIds);
      
      if (countyError) throw countyError;
      
      // Count counties per VA
      const countMap: Record<string, number> = {};
      countyCounts?.forEach(c => {
        if (c.assigned_to) {
          countMap[c.assigned_to] = (countMap[c.assigned_to] || 0) + 1;
        }
      });
      
      return (profiles || []).map(p => ({
        id: p.user_id,
        email: p.email || '',
        full_name: p.full_name,
        counties_count: countMap[p.user_id] || 0,
      })) as VAUser[];
    },
  });
}
