import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUserLists, useCreateList } from "@/hooks/useLists";
import { supabase } from "@/integrations/supabase/externalClient";
import { exportFilteredCsv } from "@/services/export";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradePrompt, type ExportContext } from "@/components/subscription/UpgradePrompt";

import { ListCard } from "@/components/lists/ListCard";
import { CreateListCard } from "@/components/lists/CreateListCard";
import { ListsHeader } from "@/components/lists/ListsHeader";
import { EmptyListsState } from "@/components/lists/EmptyListsState";

export function Lists() {
  const { toast } = useToast();
  const { checkLimit, refetch: refetchSubscription, plan, usage, getRemainingCount } = useSubscription();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null);
  const [newListName, setNewListName] = useState("");
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [exportContext, setExportContext] = useState<ExportContext | undefined>(undefined);

  const { data: lists = [], isLoading, refetch } = useUserLists();
  const createListMutation = useCreateList();

  const totalProperties = useMemo(
    () => lists.reduce((sum, list) => sum + list.property_count, 0),
    [lists]
  );

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
      await createListMutation.mutateAsync(newListName.trim());
      toast({
        title: "Success",
        description: "List created successfully",
      });
      setNewListName("");
      setCreateDialogOpen(false);
    } catch (error: any) {
      console.error("Error creating list:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create list",
        variant: "destructive",
      });
    }
  };

  const handleDeleteList = async () => {
    if (!listToDelete) return;

    try {
      const { error } = await supabase
        .from("lead_lists")
        .delete()
        .eq("id", listToDelete.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "List deleted successfully",
      });

      setDeleteDialogOpen(false);
      setListToDelete(null);
      refetch();
    } catch (error: any) {
      console.error("Error deleting list:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete list",
        variant: "destructive",
      });
    }
  };

  const handleExportList = async (listId: string, listName: string, propertyCount: number) => {
    if (propertyCount === 0) {
      toast({
        title: "Empty list",
        description: "No properties to export",
        variant: "destructive",
      });
      return;
    }

    const remaining = getRemainingCount('exports');
    const maxMonthly = plan?.max_monthly_exports ?? 0;

    if (remaining !== null && propertyCount > remaining) {
      const usedCount = usage?.exports_count ?? 0;
      setExportContext({
        requestedCount: propertyCount,
        remainingCount: remaining ?? 0,
        usedCount,
        maxCount: maxMonthly,
        listId,
      });
      setShowUpgradePrompt(true);
      return;
    }

    const limitResult = await checkLimit("exports", propertyCount);
    if (!limitResult.allowed) {
      const usedCount = usage?.exports_count ?? 0;
      setExportContext({
        requestedCount: propertyCount,
        remainingCount: limitResult.remaining ?? 0,
        usedCount,
        maxCount: maxMonthly,
        listId,
      });
      setShowUpgradePrompt(true);
      return;
    }

    setIsExporting(listId);
    try {
      const PAGE_SIZE = 1000;
      let allPropertyIds: string[] = [];
      let lastId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("list_properties")
          .select("id, property_id")
          .eq("list_id", listId)
          .order("id", { ascending: true })
          .limit(PAGE_SIZE);

        if (lastId) {
          query = query.gt("id", lastId);
        }

        const { data: listProps, error } = await query;

        if (error) throw error;

        if (!listProps || listProps.length === 0) {
          hasMore = false;
          break;
        }

        const batchIds = listProps.map((lp) => lp.property_id).filter(Boolean) as string[];
        allPropertyIds = allPropertyIds.concat(batchIds);

        lastId = listProps[listProps.length - 1].id;
        hasMore = listProps.length === PAGE_SIZE;
      }

      const propertyIds = allPropertyIds;

      if (propertyIds.length === 0) {
        toast({
          title: "Empty list",
          description: "No properties to export",
          variant: "destructive",
        });
        return;
      }

      await exportFilteredCsv({
        propertyIds,
        expectedPropertyCount: propertyIds.length
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Exported ${propertyIds.length.toLocaleString()} properties from "${listName}"`,
      });
    } catch (error: any) {
      if (error.message === "EXPORT_LIMIT_EXCEEDED") {
        const usedCount = usage?.exports_count ?? 0;
        const remaining = getRemainingCount('exports') ?? 0;
        setExportContext({
          requestedCount: propertyCount,
          remainingCount: remaining,
          usedCount,
          maxCount: maxMonthly,
          listId,
        });
        setShowUpgradePrompt(true);
        return;
      }
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export",
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-6xl space-y-6">
        {/* Header with stats */}
        <ListsHeader listCount={lists.length} totalProperties={totalProperties} />

        {/* Create button for mobile */}
        <div className="sm:hidden">
          <Button onClick={() => setCreateDialogOpen(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Create New List
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : lists.length === 0 ? (
          <EmptyListsState onCreateClick={() => setCreateDialogOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Create new list card - desktop only */}
            <div className="hidden sm:block">
              <CreateListCard onClick={() => setCreateDialogOpen(true)} />
            </div>

            {/* List cards */}
            {lists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                isExporting={isExporting === list.id}
                onExport={() => handleExportList(list.id, list.name, list.property_count)}
                onDelete={() => {
                  setListToDelete({ id: list.id, name: list.name });
                  setDeleteDialogOpen(true);
                }}
              />
            ))}
          </div>
        )}

        {/* Footer summary */}
        {lists.length > 0 && (
          <p className="text-center text-sm text-muted-foreground pt-4">
            Showing {lists.length} {lists.length === 1 ? "list" : "lists"} · {totalProperties.toLocaleString()} total properties
          </p>
        )}

        {/* Create List Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New List</DialogTitle>
              <DialogDescription>
                Give your list a name to start organizing your leads
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="list-name">List Name</Label>
                <Input
                  id="list-name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., High Priority, Q1 Targets"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !createListMutation.isPending) {
                      handleCreateList();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateList}
                disabled={createListMutation.isPending}
              >
                {createListMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create List"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete List</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{listToDelete?.name}"? This action cannot be undone.
                The properties will not be deleted, only removed from this list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteList}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Upgrade Prompt */}
        <UpgradePrompt
          open={showUpgradePrompt}
          onOpenChange={(open) => {
            setShowUpgradePrompt(open);
            if (!open) setExportContext(undefined);
          }}
          limitType="exports"
          currentPlan={plan?.name}
          exportContext={exportContext}
        />
      </div>
    </AppLayout>
  );
}

export default Lists;
