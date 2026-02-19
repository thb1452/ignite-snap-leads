import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBulkAddToList, useUserLists, useCreateList } from "@/hooks/useLists";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyIds: string[];
  onSuccess: () => void;
}

export function AddToListDialog({ open, onOpenChange, propertyIds, onSuccess }: AddToListDialogProps) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const bulkAddMutation = useBulkAddToList();
  const createListMutation = useCreateList();
  const { data: userLists = [], isLoading: isLoadingLists } = useUserLists();

  // Force refetch lists every time the dialog opens
  useEffect(() => {
    if (open) {
      qc.invalidateQueries({ queryKey: ["lists"] });
    }
  }, [open, qc]);

  const handleAddToList = async () => {
    if (mode === "existing" && !selectedListId) {
      toast({ title: "No list selected", description: "Please select a list", variant: "destructive" });
      return;
    }
    if (mode === "new" && !newListName.trim()) {
      toast({ title: "No list name", description: "Please enter a list name", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let listId = selectedListId;
      let listName = userLists.find(l => l.id === selectedListId)?.name;

      if (mode === "new") {
        listId = await createListMutation.mutateAsync(newListName.trim());
        listName = newListName.trim();
      }

      await bulkAddMutation.mutateAsync({ listId, propertyIds });

      toast({
        title: "Success",
        description: `${propertyIds.length} property${propertyIds.length > 1 ? 's' : ''} added to "${listName}"`,
      });

      onSuccess();
      onOpenChange(false);
      setMode("existing");
      setSelectedListId("");
      setNewListName("");
    } catch (error: any) {
      console.error("Error adding to list:", error);
      toast({ title: "Error", description: error.message || "Failed to add properties to list", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {propertyIds.length} Property{propertyIds.length > 1 ? 's' : ''} to List</DialogTitle>
          <DialogDescription>Choose an existing list or create a new one</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button
              variant={mode === "existing" ? "default" : "outline"}
              onClick={() => setMode("existing")}
              className="flex-1"
            >
              Existing List
            </Button>
            <Button
              variant={mode === "new" ? "default" : "outline"}
              onClick={() => setMode("new")}
              className="flex-1"
            >
              New List
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Label>Select List</Label>
              {isLoadingLists ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : userLists.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No lists yet. Create your first list!
                </p>
              ) : (
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a list" />
                  </SelectTrigger>
                  <SelectContent className="z-[10002]">
                    {userLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>List Name</Label>
              <Input
                placeholder="e.g., High Priority Properties"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleAddToList} disabled={isSubmitting}>
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</>
            ) : (
              "Add to List"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
