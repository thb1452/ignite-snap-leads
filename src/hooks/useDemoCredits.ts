import { useAuth } from './use-auth';
import { useCreditBalance } from './useCredits';

const DEMO_CREDIT_AMOUNT = 1000;

export function useDemoCredits() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { data: balance, isLoading: creditsLoading } = useCreditBalance();

  // Admin users get unlimited credits (shown as demo credits)
  // Non-admin users with low credits can use demo mode
  const effectiveBalance = isAdmin ? DEMO_CREDIT_AMOUNT : (balance ?? 0);
  const isDemoMode = isAdmin || (balance ?? 0) < 10;
  const hasCredits = effectiveBalance > 0;

  return {
    balance: effectiveBalance,
    isDemoMode,
    isAdmin,
    hasCredits,
    loading: authLoading || creditsLoading,
    // Helper to check if action is allowed
    canPerformAction: (creditCost: number = 1) => {
      if (isAdmin) return true; // Admins bypass credit checks
      return effectiveBalance >= creditCost;
    },
  };
}
