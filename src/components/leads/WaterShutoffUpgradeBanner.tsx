import { Button } from "@/components/ui/button";
import { Droplets, ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface WaterShutoffUpgradeBannerProps {
  dataTier: string | null;
}

export function WaterShutoffUpgradeBanner({ dataTier }: WaterShutoffUpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  // Only show for basic tier users
  if (dataTier !== 'basic' || dismissed) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4 mx-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-cyan-100 dark:bg-cyan-900 rounded-full shrink-0">
            <Droplets className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">
              Unlock Water Shutoff Properties
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Properties with utility disconnections convert at <span className="font-semibold text-cyan-700 dark:text-cyan-300">10x the rate</span> of basic violations. Upgrade to Professional to access this premium data.
            </p>
            <Button
              size="sm"
              className="mt-3 gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
              onClick={() => navigate('/pricing')}
            >
              Upgrade to Professional
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
