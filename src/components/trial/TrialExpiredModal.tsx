import { useState, useEffect } from "react";
import { useTrialStatus } from "@/hooks/useTrialStatus";
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
import { ArrowRight, Building2 } from "lucide-react";

const SESSION_KEY = 'snap_trial_expired_shown';

const TIER_PRICES: Record<string, number> = {
  starter: 79,
  professional: 149,
  enterprise: 299,
};

export function TrialExpiredModal() {
  const { hasTrialExpired, trialTier, loading } = useTrialStatus();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !hasTrialExpired) return;

    // Only show once per session
    try {
      const alreadyShown = sessionStorage.getItem(SESSION_KEY);
      if (!alreadyShown) {
        setOpen(true);
        sessionStorage.setItem(SESSION_KEY, 'true');
      }
    } catch {
      // ignore
    }
  }, [hasTrialExpired, loading]);

  if (!hasTrialExpired) return null;

  const tierDisplay = trialTier === 'professional' ? 'Pro' : trialTier === 'enterprise' ? 'Elite' : 'Starter';
  const price = TIER_PRICES[trialTier || 'starter'] || 119;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mb-2">
            <Building2 className="h-7 w-7 text-orange-600" />
          </div>
          <DialogTitle className="text-center text-xl">
            Trial Expired
          </DialogTitle>
          <DialogDescription className="text-center">
            Your saved properties are waiting. Upgrade to export them and continue finding motivated sellers.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link to="/pricing" className="w-full">
            <Button className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700" size="lg">
              Subscribe to {tierDisplay} — ${price}/mo
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
          <Link to="/pricing" className="w-full">
            <Button variant="outline" className="w-full">
              View All Plans
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
