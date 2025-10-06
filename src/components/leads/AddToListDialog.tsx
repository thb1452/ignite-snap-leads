import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LeadList {
  id: string;
  name: string;
  created_at: string;
}

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  onListAdded: () => void;
  currentListIds: string[];
}

export function AddToListDialog({
  open,
  onOpenChange,
  propertyId,
  onListAdded,
  currentListIds,
}: AddToListDialogProps) {
  const [lists, setLists] = useState<LeadList[]>([]);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchLists();
    }
  }, [open]);

  const fetchLists = async () => {
    try {
      const { data, error } = await supabase
        .from("lead_lists")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLists(data || []);
    } catch (error) {
      console.error("Error fetching lists:", error);
      toast({
        title: "Error",
        description: "Failed to load lists",
        variant: "destructive",
      });
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a list name",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("lead_lists")
        .insert({ name: newListName.trim() })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "List created successfully",
      });

      setNewListName("");
      setShowCreateNew(false);
      fetchLists();
    } catch (error) {
      console.error("Error creating list:", error);
      toast({
        title: "Error",
        description: "Failed to create list",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToList = async (listId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("list_properties")
        .insert({
          list_id: listId,
          property_id: propertyId,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Property added to list",
      });

      onListAdded();
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding to list:", error);
      toast({
        title: "Error",
        description: "Failed to add property to list",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add to List</DialogTitle>
          <DialogDescription>
            Select a list or create a new one
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {showCreateNew ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="list-name">List Name</Label>
                <Input
                  id="list-name"
                  placeholder="e.g., High Priority Leads"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateList();
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateList}
                  disabled={loading || !newListName.trim()}
                  className="flex-1"
                >
                  Create List
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateNew(false);
                    setNewListName("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowCreateNew(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New List
              </Button>

              {lists.length > 0 ? (
                <ScrollArea className="h-[200px] border rounded-md p-2">
                  <div className="space-y-2">
                    {lists.map((list) => {
                      const isInList = currentListIds.includes(list.id);
                      return (
                        <Button
                          key={list.id}
                          variant={isInList ? "secondary" : "ghost"}
                          className="w-full justify-between"
                          onClick={() => !isInList && handleAddToList(list.id)}
                          disabled={loading || isInList}
                        >
                          <span>{list.name}</span>
                          {isInList && <Check className="h-4 w-4" />}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center p-6 text-muted-foreground text-sm">
                  No lists yet. Create your first list!
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
