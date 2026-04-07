import { Coins } from "lucide-react";
import { useCreditBalance } from "@/hooks/useCredits";
import { useFreeUnlocks } from "@/hooks/useFreeUnlocks";
import { useSubscription } from "@/hooks/useSubscription";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { getCreditBalance } from "@/services/credits";

const FREE_UNLOCK_TOTAL = 3;

export function CreditBalanceChip() {
  const { data: creditBalance, isLoading: balanceLoading } = useCreditBalance();
  const { freeUnlocksRemaining, isLoading: freeLoading } = useFreeUnlocks();
  const { hasActiveSubscription, plan, usage } = useSubscription();

  // Bulk credits from credit_ledger (always fetch so we can show for non-subscribers)
  const { data: ledgerBalance = 0 } = useQuery({
    queryKey: ["credits", "balance"],
    queryFn: getCreditBalance,
    retry: 1,
    staleTime: 30000,
  });

  if (balanceLoading && freeLoading) return null;

  let display: string;
  let tooltipText: string;

  if (hasActiveSubscription && plan && usage) {
    // Subscriber: show remaining / limit
    const limit = plan.max_monthly_exports;
    const used = usage.exports_count ?? 0;
    if (limit === -1) {
      display = "∞";
      tooltipText = "Unlimited credits";
    } else {
      const subRemaining = Math.max(0, limit - used);
      if (ledgerBalance > 0) {
        const total = subRemaining + ledgerBalance;
        display = total.toLocaleString();
        tooltipText = `${subRemaining.toLocaleString()} monthly + ${ledgerBalance.toLocaleString()} bulk = ${total.toLocaleString()} total credits`;
      } else {
        display = `${subRemaining}/${limit}`;
        tooltipText = `${subRemaining} of ${limit} monthly credits remaining`;
      }
    }
  } else if (ledgerBalance > 0) {
    // Non-subscriber with bulk credits purchased
    display = ledgerBalance.toLocaleString();
    tooltipText = `${ledgerBalance.toLocaleString()} bulk credits remaining`;
    if (freeUnlocksRemaining > 0) {
      tooltipText += ` + ${freeUnlocksRemaining} free unlocks`;
    }
  } else {
    // Non-subscriber, no bulk credits — show free unlocks
    const used = FREE_UNLOCK_TOTAL - freeUnlocksRemaining;
    display = `${freeUnlocksRemaining}/${FREE_UNLOCK_TOTAL}`;
    tooltipText = `${freeUnlocksRemaining} of ${FREE_UNLOCK_TOTAL} free unlocks remaining`;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          to="/pricing"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
        >
          <Coins className="h-3.5 w-3.5" />
          <span>{display}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
