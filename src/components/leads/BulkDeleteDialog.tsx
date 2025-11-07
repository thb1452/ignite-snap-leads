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
import { supabase } from "@/integrations/supabase/client";
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
      // First get properties in the city
      const { data: properties, error: fetchError } = await supabase
        .from("properties")
        .select("id")
        .ilike("city", city.trim());

      if (fetchError) throw fetchError;

      if (!properties || properties.length === 0) {
        toast({
          title: "No properties found",
          description: `No properties found in city: ${city}`,
        });
        setIsDeleting(false);
        return;
      }

      const propertyIds = properties.map(p => p.id);

      // Delete violations first (foreign key constraint)
      const { error: violationsError } = await supabase
        .from("violations")
        .delete()
        .in("property_id", propertyIds);

      if (violationsError) throw violationsError;

      // Then delete properties
      const { error: propertiesError } = await supabase
        .from("properties")
        .delete()
        .in("id", propertyIds);

      if (propertiesError) throw propertiesError;

      toast({
        title: "Bulk delete successful",
        description: `Deleted ${properties.length} properties and their violations from ${city}`,
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
            Delete all properties and their violations from a specific city
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This action cannot be undone. All properties and violations in the specified city will be permanently deleted.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="city">City Name</Label>
            <Input
              id="city"
              placeholder="Enter city name"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={isDeleting}
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
            />
          </div>
        </div>

        <DialogFooter>
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
