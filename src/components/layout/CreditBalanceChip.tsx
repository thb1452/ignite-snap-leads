import { Coins } from "lucide-react";
import { useCreditBalance } from "@/hooks/useCredits";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CreditBalanceChip() {
  const { data: balance, isLoading } = useCreditBalance();

  if (isLoading || balance === undefined) return null;

  const display =
    balance === Number.POSITIVE_INFINITY ? "∞" : balance.toLocaleString();

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
        <p className="text-xs">{display} credits remaining</p>
      </TooltipContent>
    </Tooltip>
  );
}
