import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBulkAddToList } from "@/hooks/useLists";

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyIds: string[];
  userLists: { id: string; name: string }[];
  onSuccess: () => void;
}

export function AddToListDialog({ open, onOpenChange, propertyIds, userLists, onSuccess }: AddToListDialogProps) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const { toast } = useToast();
  const bulkAddMutation = useBulkAddToList();

  const handleAddToList = async () => {
    if (mode === "existing" && !selectedListId) {
      toast({
        title: "No list selected",
        description: "Please select a list",
        variant: "destructive",
      });
      return;
    }

    if (mode === "new" && !newListName.trim()) {
      toast({
        title: "No list name",
        description: "Please enter a list name",
        variant: "destructive",
      });
      return;
    }

    try {
      let targetListId = selectedListId;

      // Create new list if needed
      if (mode === "new") {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: newList, error } = await supabase
          .from("lead_lists")
          .insert({ name: newListName.trim(), user_id: user.id })
          .select()
          .single();

        if (error) throw error;
        targetListId = newList.id;
      }

      // Add properties to list
      await bulkAddMutation.mutateAsync({
        listId: targetListId,
        propertyIds,
      });

      toast({
        title: "Success",
        description: `${propertyIds.length} lead(s) added to ${mode === "new" ? newListName : userLists.find(l => l.id === selectedListId)?.name}`,
      });

      onSuccess();
      onOpenChange(false);
      setMode("existing");
      setSelectedListId("");
      setNewListName("");
    } catch (error: any) {
      console.error("Error adding to list:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add leads to list",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {propertyIds.length} Lead(s) to List</DialogTitle>
          <DialogDescription>
            Choose an existing list or create a new one
          </DialogDescription>
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
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a list" />
                </SelectTrigger>
                <SelectContent>
                  {userLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>List Name</Label>
              <Input
                placeholder="e.g., High Priority Leads"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddToList} disabled={bulkAddMutation.isPending}>
            {bulkAddMutation.isPending ? "Adding..." : "Add to List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
