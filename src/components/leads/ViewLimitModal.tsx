import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, Lock, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";

interface ViewLimitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewCount: number;
  viewLimit: number;
}

export function ViewLimitModal({
  open,
  onOpenChange,
  viewCount,
  viewLimit,
}: ViewLimitModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Daily View Limit Reached
          </DialogTitle>
          <DialogDescription>
            You've viewed {viewCount} of {viewLimit} free properties today.
            Unlock a lead or subscribe for unlimited views.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Button asChild className="w-full gap-2" size="lg">
            <Link to="/pricing">
              <CreditCard className="h-4 w-4" />
              View Plans & Pricing
            </Link>
          </Button>

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full gap-2"
            size="lg"
          >
            <Lock className="h-4 w-4" />
            Continue Browsing (Locked)
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Your view limit resets daily. Subscribers get unlimited property views.
        </p>
      </DialogContent>
    </Dialog>
  );
}
