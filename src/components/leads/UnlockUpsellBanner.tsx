import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const SESSION_KEY = "unlock_upsell_banner_dismissed";

interface UnlockUpsellBannerProps {
  show: boolean;
}

export function UnlockUpsellBanner({ show }: UnlockUpsellBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "true");
    } catch {
      // sessionStorage unavailable — still dismiss for this render
    }
  };

  if (!show || dismissed) return null;

  return (
    <div className="mx-3 mt-2 mb-1 rounded-lg border border-teal-500/30 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 px-4 py-3 flex items-start gap-3 shrink-0">
      <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
      <p className="text-sm text-foreground flex-1 leading-snug">
        You've unlocked 3 leads — subscribers get unlimited unlocks + exports.{" "}
        <span className="font-medium">Plans start at $79/mo.</span>
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Link to="/pricing">
          <Button size="sm" className="h-7 text-xs px-3 bg-teal-600 hover:bg-teal-700 text-white">
            View Plans
          </Button>
        </Link>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
