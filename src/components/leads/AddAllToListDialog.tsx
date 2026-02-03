import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUserLists, useAddFilteredToList, useCreateList } from "@/hooks/useLists";
import { Loader2, ListPlus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FilterParams {
  city?: string | null;
  state?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  jurisdictionId?: string | null;
  // Additional filters that are active but not passed to RPC (for warning display)
  hasAdditionalFilters?: boolean;
}

interface AddAllToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalMatchingCount: number;
  filters: FilterParams;
  onSuccess?: () => void;
}

const MAX_PROPERTIES_PER_LIST = 25000;

export function AddAllToListDialog({
  open,
  onOpenChange,
  totalMatchingCount,
  filters,
  onSuccess,
}: AddAllToListDialogProps) {
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const { toast } = useToast();

  const { data: userLists = [], isLoading: isLoadingLists } = useUserLists();
  const addFilteredMutation = useAddFilteredToList();
  const createListMutation = useCreateList();

  const isSubmitting = addFilteredMutation.isPending || createListMutation.isPending;
  const willBeCapped = totalMatchingCount > MAX_PROPERTIES_PER_LIST;
  const propertiesToAdd = Math.min(totalMatchingCount, MAX_PROPERTIES_PER_LIST);

  const handleSubmit = async () => {
    let listId = selectedListId;
    let listName = userLists.find((l) => l.id === selectedListId)?.name;

    // Create new list if needed
    if (mode === "new") {
      if (!newListName.trim()) {
        toast({
          title: "Enter a list name",
          description: "Please provide a name for your new list",
          variant: "destructive",
        });
        return;
      }

      try {
        listId = await createListMutation.mutateAsync(newListName.trim());
        listName = newListName.trim();
      } catch (error: any) {
        toast({
          title: "Failed to create list",
          description: error.message || "Please try again",
          variant: "destructive",
        });
        return;
      }
    } else if (!selectedListId) {
      toast({
        title: "Select a list",
        description: "Please choose an existing list or create a new one",
        variant: "destructive",
      });
      return;
    }

    // Add filtered properties to list
    try {
      const result = await addFilteredMutation.mutateAsync({
        listId,
        city: filters.city,
        state: filters.state,
        minScore: filters.minScore,
        maxScore: filters.maxScore,
        jurisdictionId: filters.jurisdictionId,
        limit: MAX_PROPERTIES_PER_LIST,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to add properties");
      }

      toast({
        title: "Properties added to list",
        description: `Added ${result.inserted?.toLocaleString()} properties to "${listName}"`,
      });

      onOpenChange(false);
      setNewListName("");
      setSelectedListId("");
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Failed to add properties",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5" />
            Add All Filtered Results to List
          </DialogTitle>
          <DialogDescription>
            Save {propertiesToAdd.toLocaleString()} properties matching your current filters
          </DialogDescription>
        </DialogHeader>

        {willBeCapped && (
          <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              Your search found {totalMatchingCount.toLocaleString()} properties.
              Only the top {MAX_PROPERTIES_PER_LIST.toLocaleString()} by SnapScore will be added (plan limit).
            </AlertDescription>
          </Alert>
        )}

        {filters.hasAdditionalFilters && (
          <Alert variant="default" className="border-blue-500/50 bg-blue-500/10">
            <AlertCircle className="h-4 w-4 text-blue-500" />
            <AlertDescription className="text-blue-700 dark:text-blue-400">
              Note: Only location filters (state/city) are applied when adding all. Date range, category,
              and pressure level filters are not included. For precise filtering, select individual properties.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === "new" ? "default" : "outline"}
              onClick={() => setMode("new")}
              className="flex-1"
              size="sm"
            >
              New List
            </Button>
            <Button
              variant={mode === "existing" ? "default" : "outline"}
              onClick={() => setMode("existing")}
              className="flex-1"
              size="sm"
              disabled={userLists.length === 0}
            >
              Existing List
            </Button>
          </div>

          {mode === "new" ? (
            <div className="space-y-2">
              <Label htmlFor="new-list-name">List Name</Label>
              <Input
                id="new-list-name"
                placeholder="e.g., Houston High Priority"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Select List</Label>
              {isLoadingLists ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : userLists.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No existing lists. Create a new one instead.
                </p>
              ) : (
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a list" />
                  </SelectTrigger>
                  <SelectContent>
                    {userLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name} ({list.property_count.toLocaleString()} properties)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              `Add ${propertiesToAdd.toLocaleString()} Properties`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
