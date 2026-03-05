import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";

const BLUR_GRACE_DAYS = 5;

interface TrialPaywallProps {
  trialEndsAt?: string | null;
}

/**
 * TrialPaywall — first 5 days after expiry: blur sensitive data.
 * After 5 days: full hard-block overlay.
 */
export function TrialPaywall({ trialEndsAt }: TrialPaywallProps) {
  const daysSinceExpiry = trialEndsAt
    ? differenceInDays(new Date(), parseISO(trialEndsAt))
    : 999; // No date → assume long expired → hard block

  const isHardBlock = daysSinceExpiry >= BLUR_GRACE_DAYS;

  if (isHardBlock) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div className="text-center space-y-6 max-w-md px-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <Lock className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Your access has expired</h1>
          <p className="text-muted-foreground">
            Subscribe to a plan to regain full access to property data, exports, and insights.
          </p>
          <Link to="/pricing">
            <Button size="lg" className="font-semibold">
              View Plans
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            Questions? Contact{" "}
            <a href="mailto:hello@snapignite.com" className="text-primary hover:underline">
              hello@snapignite.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Blur mode (first 5 days after expiry)
  return (
    <>
      {/* Persistent top banner */}
      <div className="sticky top-0 z-50 w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
        <Shield className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Your trial has ended — subscribe to unlock your results
        </span>
        <Link to="/pricing">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-3 text-xs font-semibold bg-white text-orange-700 hover:bg-orange-50"
          >
            View Plans
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>

      {/* CSS blur layer */}
      <style>{`
        [data-blur-gated="address"],
        .property-address {
          filter: blur(6px);
          user-select: none;
          pointer-events: none;
        }
        [data-blur-gated="score"],
        .snap-score-value {
          filter: blur(6px);
          user-select: none;
          pointer-events: none;
        }
        [data-blur-gated="insight"],
        .snap-insight-text {
          filter: blur(6px);
          user-select: none;
          pointer-events: none;
        }
        [data-blur-gated="export"] {
          pointer-events: none;
          opacity: 0.5;
        }
      `}</style>
    </>
  );
}
