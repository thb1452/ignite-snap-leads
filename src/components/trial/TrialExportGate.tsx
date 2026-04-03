import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";

interface TrialExportGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'exhausted' | 'expired';
  trialTier?: string | null;
  trialEndsAt?: string | null;
}

const TIER_PRICES: Record<string, number> = {
  starter: 49,
  professional: 99,
  enterprise: 199,
};

export function TrialExportGate({ open, onOpenChange, type, trialTier, trialEndsAt }: TrialExportGateProps) {
  const tierDisplay = trialTier === 'professional' ? 'Pro' : trialTier === 'enterprise' ? 'Elite' : 'Starter';
  const price = TIER_PRICES[trialTier || 'starter'] || 79;
  const expiredDate = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-orange-600" />
          </div>
          <DialogTitle className="text-center">
            {type === 'exhausted' ? 'Trial Exports Used' : 'Trial Expired'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {type === 'exhausted'
              ? "You've used all 500 trial exports. Upgrade to continue exporting properties."
              : `Your 3-day trial ended${expiredDate ? ` on ${expiredDate}` : ''}. Upgrade to continue exporting.`
            }
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link to={`/auth?mode=signup&plan=${trialTier || 'starter'}`} className="w-full">
            <Button className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700">
              Upgrade to {tierDisplay} — ${price}/mo
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          <Link to="/pricing" className="w-full">
            <Button variant="outline" className="w-full">
              View Other Plans
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
