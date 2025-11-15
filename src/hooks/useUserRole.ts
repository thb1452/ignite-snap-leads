import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

export type AppRole = 'admin' | 'va' | 'user';

export function useUserRole() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    const fetchRoles = async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching roles:', error);
        setRoles([]);
      } else {
        setRoles(data?.map(r => r.role as AppRole) || []);
      }
      setLoading(false);
    };

    fetchRoles();
  }, [user]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole('admin');
  const isVA = hasRole('va');

  return {
    roles,
    loading,
    hasRole,
    isAdmin,
    isVA,
  };
}
