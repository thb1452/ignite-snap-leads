import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { checkConsent, setConsent } from "@/services/skiptraceJobs";
import { useToast } from "@/hooks/use-toast";

interface ConsentDialogProps {
  open: boolean;
  onConsent: () => void;
  onCancel: () => void;
}

export function ConsentDialog({ open, onConsent, onCancel }: ConsentDialogProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!agreed) {
      toast({
        title: "Agreement required",
        description: "Please confirm you have a permissible purpose",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await setConsent();
      onConsent();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save consent",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skip Trace Consent</DialogTitle>
          <DialogDescription>
            Before proceeding, please confirm your understanding of our terms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            By using our skip trace service, you confirm that you have a permissible purpose
            under the Fair Credit Reporting Act (FCRA) and applicable state laws.
          </p>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="consent"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked as boolean)}
            />
            <label
              htmlFor="consent"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I confirm I have a permissible purpose per our{" "}
              <a href="/terms" className="text-primary underline" target="_blank">
                Terms of Service
              </a>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!agreed || loading}>
            {loading ? "Saving..." : "I Agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useSkipTraceConsent() {
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    checkConsent().then(setHasConsent);
  }, []);

  const requestConsent = (onConsent: () => void) => {
    if (hasConsent) {
      onConsent();
    } else {
      setShowDialog(true);
      const handleConsent = () => {
        setHasConsent(true);
        setShowDialog(false);
        onConsent();
      };
      return { showDialog, setShowDialog, handleConsent };
    }
  };

  return {
    hasConsent,
    showDialog,
    setShowDialog,
    requestConsent,
  };
}
