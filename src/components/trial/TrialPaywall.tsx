import { Button } from "@/components/ui/button";
import { Lock, ArrowRight, Shield } from "lucide-react";
import { Link } from "react-router-dom";

export function TrialPaywall() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="max-w-md mx-auto text-center p-8 rounded-2xl bg-card border shadow-2xl">
        <div className="mx-auto w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-orange-600" />
        </div>

        <h2 className="text-2xl font-bold mb-2">Your Trial Has Ended</h2>
        <p className="text-muted-foreground mb-6">
          Subscribe to a plan to unlock property data, exports, and all enforcement intelligence features.
        </p>

        <div className="flex flex-col gap-3">
          <Link to="/pricing" className="w-full">
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
            >
              <Shield className="mr-2 h-4 w-4" />
              View Plans & Subscribe
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
