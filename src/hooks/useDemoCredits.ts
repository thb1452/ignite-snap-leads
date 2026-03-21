import { useAuth } from './use-auth';
import { useCreditBalance } from './useCredits';

export function useDemoCredits() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { data: balance, isLoading: creditsLoading } = useCreditBalance();

  const effectiveBalance = balance ?? 0;
  const hasCredits = effectiveBalance > 0;

  return {
    balance: effectiveBalance,
    isDemoMode: isAdmin, // Only admins are in demo mode, never paying users
    isAdmin,
    hasCredits,
    loading: authLoading || creditsLoading,
    canPerformAction: (creditCost: number = 1) => {
      if (isAdmin) return true;
      return effectiveBalance >= creditCost;
    },
  };
}
