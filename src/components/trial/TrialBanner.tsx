import { useState } from "react";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { Button } from "@/components/ui/button";
import { X, Clock, Download, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

export function TrialBanner() {
  const {
    isOnTrial,
    hasTrialExpired,
    trialDaysRemaining,
    trialExportsUsed,
    trialExportsRemaining,
    trialExportsLimit,
    trialTier,
    trialEndsAt,
    loading,
  } = useTrialStatus();

  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed) return null;

  const tierDisplay = trialTier === 'professional' ? 'Pro' : trialTier === 'enterprise' ? 'Elite' : 'Starter';
  const exportPercent = (trialExportsUsed / trialExportsLimit) * 100;

  // Show expired banner
  if (hasTrialExpired) {
    const expiredDate = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return (
      <div className="bg-gradient-to-r from-red-500/90 to-orange-500/90 text-white">
        <div className="mx-auto max-w-[1400px] px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Your trial expired{expiredDate ? ` on ${expiredDate}` : ''}. Upgrade to keep finding deals.
            </span>
          </div>
          <Link to="/pricing">
            <Button size="sm" variant="secondary" className="h-7 text-xs font-semibold">
              See Pricing
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show active trial banner
  if (!isOnTrial) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        className="bg-gradient-to-r from-cyan-600 to-teal-600 text-white"
      >
        <div className="mx-auto max-w-[1400px] px-6 py-2 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="font-medium">
                Free Trial: {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left
              </span>
            </div>
            <span className="text-white/60">•</span>
            <div className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span>{trialExportsRemaining} exports remaining</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 w-24">
              <Progress value={exportPercent} className="h-1.5 [&>div]:bg-white/80 bg-white/20" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/pricing">
              <Button size="sm" variant="secondary" className="h-7 text-xs font-semibold">
                Upgrade Now
              </Button>
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 hover:bg-white/20 rounded transition"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
