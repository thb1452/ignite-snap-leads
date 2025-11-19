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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BulkDeleteDialog({ open, onOpenChange, onSuccess }: BulkDeleteDialogProps) {
  const [city, setCity] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!city.trim() || confirmText !== "DELETE") {
      toast({
        title: "Confirmation required",
        description: 'Please type "DELETE" to confirm',
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);

    try {
      // Demo mode - simulate delete
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast({
        title: "Demo Mode",
        description: `Bulk delete simulated for city: ${city}`,
      });

      setCity("");
      setConfirmText("");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Bulk delete error:", error);
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete properties",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Bulk Delete Properties
          </DialogTitle>
          <DialogDescription>
            Delete all properties and their violations from a specific city or state
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This action cannot be undone. All properties and violations in the specified city will be permanently deleted.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="city">City or State</Label>
            <Input
              id="city"
              placeholder="Enter city or state (e.g., Terrell or Texas)"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting || !city.trim() || confirmText !== "DELETE"}
          >
            {isDeleting ? "Deleting..." : "Delete All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
