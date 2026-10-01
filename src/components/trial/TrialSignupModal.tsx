import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FREE_ACCOUNT_MESSAGE } from "@/lib/publicAvailability";
interface TrialSignupModalProps { open: boolean; onOpenChange: (open: boolean) => void; selectedTier: string; }
export function TrialSignupModal({ open, onOpenChange }: TrialSignupModalProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader>
    <DialogTitle>Paid trials are paused</DialogTitle><DialogDescription>{FREE_ACCOUNT_MESSAGE}</DialogDescription>
  </DialogHeader><Button asChild><Link to="/auth?mode=signup" onClick={() => onOpenChange(false)}>Create a free account</Link></Button>
  </DialogContent></Dialog>;
}
