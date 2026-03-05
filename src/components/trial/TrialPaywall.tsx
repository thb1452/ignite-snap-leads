import { Button } from "@/components/ui/button";
import { Shield, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * TrialPaywall — blurs property data instead of blocking the full page.
 * Renders as an overlay with a persistent banner + blurred content indicators.
 */
export function TrialPaywall() {
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

      {/* CSS blur layer — targets data elements via data attributes */}
      <style>{`
        /* Blur property addresses */
        [data-blur-gated="address"],
        .property-address {
          filter: blur(6px);
          user-select: none;
          pointer-events: none;
        }
        
        /* Blur SnapScore numbers */
        [data-blur-gated="score"],
        .snap-score-value {
          filter: blur(6px);
          user-select: none;
          pointer-events: none;
        }
        
        /* Blur SnapInsight text */
        [data-blur-gated="insight"],
        .snap-insight-text {
          filter: blur(6px);
          user-select: none;
          pointer-events: none;
        }
        
        /* Disable export buttons */
        [data-blur-gated="export"] {
          pointer-events: none;
          opacity: 0.5;
        }
      `}</style>
    </>
  );
}
