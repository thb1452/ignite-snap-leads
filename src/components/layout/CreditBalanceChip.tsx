import { Coins } from "lucide-react";
import { useCreditBalance } from "@/hooks/useCredits";
import { useFreeUnlocks } from "@/hooks/useFreeUnlocks";
import { useSubscription } from "@/hooks/useSubscription";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FREE_UNLOCK_TOTAL = 3;

export function CreditBalanceChip() {
  const { data: balance, isLoading: balanceLoading } = useCreditBalance();
  const { freeUnlocksRemaining, isLoading: freeLoading } = useFreeUnlocks();
  const { hasActiveSubscription, plan, usage } = useSubscription();

  if ((balanceLoading && freeLoading) || balance === undefined) return null;

  // Determine display based on user type
  let display: string;
  let tooltipText: string;

  if (hasActiveSubscription && plan && usage) {
    // Subscriber: show used / limit
    const limit = plan.max_monthly_exports;
    const used = usage.exports_count ?? 0;
    if (limit === -1) {
      display = "∞";
      tooltipText = "Unlimited credits";
    } else {
      const remaining = Math.max(0, limit - used);
      display = `${remaining}/${limit}`;
      tooltipText = `${remaining} of ${limit} credits remaining this month`;
    }
  } else {
    // Non-subscriber: show free unlocks used/total
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
