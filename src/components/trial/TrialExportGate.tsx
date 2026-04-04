import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CreditCard, Sparkles, DollarSign } from "lucide-react";

interface TrialExportGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'exhausted' | 'expired';
  trialTier?: string | null;
  trialEndsAt?: string | null;
}

export function TrialExportGate({ open, onOpenChange, type }: TrialExportGateProps) {
  const navigate = useNavigate();

  const handleGoToPricing = () => {
    onOpenChange(false);
    navigate("/settings?tab=subscription");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center mb-2">
            <AlertTriangle className="h-6 w-6 text-orange-600" />
          </div>
          <DialogTitle className="text-center">
            {type === 'exhausted' ? 'No Export Plan' : 'No Active Plan'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {type === 'exhausted'
              ? "Subscribe to export properties as CSV, or unlock addresses individually at $0.67 each."
              : "Choose a plan to start exporting properties."}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full gap-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700"
            onClick={handleGoToPricing}
          >
            <Sparkles className="h-4 w-4" />
            View Plans — Starting at $49/mo
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleGoToPricing}
          >
            <DollarSign className="h-4 w-4" />
            Pay-as-you-go — $0.67 per property
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
