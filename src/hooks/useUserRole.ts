// This hook is deprecated - use useAuth() instead which now includes roles
import { useAuth } from './use-auth';

export type AppRole = 'admin' | 'va' | 'user';

export function useUserRole() {
  const { roles, loading, hasRole, isAdmin, isVA } = useAuth();

  return {
    roles,
    loading,
    hasRole,
    isAdmin,
    isVA,
  };
}
