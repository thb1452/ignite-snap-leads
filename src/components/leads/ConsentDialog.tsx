import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface ConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConsent: () => void;
}

export function ConsentDialog({ open, onOpenChange, onConsent }: ConsentDialogProps) {
  const [agreed, setAgreed] = useState(false);

  const handleConsent = () => {
    if (agreed) {
      onConsent();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Skip Trace Consent</DialogTitle>
          <DialogDescription>
            Please confirm your agreement before proceeding with skip tracing.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="flex items-start space-x-3">
            <Checkbox 
              id="consent" 
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked as boolean)}
            />
            <label
              htmlFor="consent"
              className="text-sm font-medium leading-relaxed cursor-pointer"
            >
              By skip tracing, I confirm that I have a permissible purpose under applicable law
              (e.g., FCRA, TCPA) and agree to the Terms of Service. I understand that skip tracing
              will use credits from my account.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConsent}
            disabled={!agreed}
          >
            I Agree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
