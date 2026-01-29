import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Eye, Download, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUserLists, useCreateList } from "@/hooks/useLists";
import { supabase } from "@/integrations/supabase/client";
import { exportFilteredCsv } from "@/services/export";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradePrompt, type ExportContext } from "@/components/subscription/UpgradePrompt";

export function Lists() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { checkLimit, refetch: refetchSubscription, plan, usage, getRemainingCount } = useSubscription();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<{ id: string; name: string } | null>(null);
  const [newListName, setNewListName] = useState("");
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [exportContext, setExportContext] = useState<ExportContext | undefined>(undefined);

  // Use the new hook
  const { data: lists = [], isLoading, refetch } = useUserLists();
  const createListMutation = useCreateList();

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

    // CRITICAL: Check quota with PROPERTY COUNT, not just "1 export"
    // Each property exported counts against the monthly limit
    const remaining = getRemainingCount('exports');
    const maxMonthly = plan?.max_monthly_exports ?? 0;

    // For unlimited plans (remaining === null), skip the client-side check
    if (remaining !== null && propertyCount > remaining) {
      // Distinguish between "list exceeds total plan limit" vs "list exceeds remaining quota"
      const exceedsTotalLimit = propertyCount > maxMonthly;
      
      if (exceedsTotalLimit) {
        // List size is larger than the entire monthly allowance - suggest splitting or upgrading
        toast({
          title: "List Exceeds Monthly Limit",
          description: `This list contains ${propertyCount.toLocaleString()} properties, which exceeds your plan's monthly limit of ${maxMonthly.toLocaleString()}. Split the list or upgrade to export.`,
          variant: "destructive",
          duration: 10000,
        });
      } else {
        // User has used some quota - show remaining and suggest waiting or upgrading
        toast({
          title: "Insufficient Export Quota",
          description: `You have ${remaining.toLocaleString()} exports remaining this month. This list requires ${propertyCount.toLocaleString()}. Wait until next billing cycle or upgrade.`,
          variant: "destructive",
          duration: 8000,
        });
      }
      // Set export context for the UpgradePrompt
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

    // Server-side check with property count
    const limitResult = await checkLimit("exports", propertyCount);
    if (!limitResult.allowed) {
      const usedCount = usage?.exports_count ?? 0;
      const exceedsTotalLimit = propertyCount > maxMonthly;
      toast({
        title: exceedsTotalLimit ? "List Exceeds Monthly Limit" : "Export Limit Exceeded",
        description: limitResult.message || `Insufficient export quota. You need ${propertyCount.toLocaleString()} but don't have enough remaining.`,
        variant: "destructive",
        duration: 8000,
      });
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
      // Get ALL property IDs using cursor pagination (faster than offset for large lists)
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

      // Pass expectedPropertyCount for server-side quota validation
      await exportFilteredCsv({
        propertyIds,
        expectedPropertyCount: propertyIds.length
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Exported ${propertyIds.length.toLocaleString()} properties from "${listName}" (counted against quota)`,
      });
    } catch (error: any) {
      if (error.message === "EXPORT_LIMIT_EXCEEDED") {
        // Server rejected — set context for the upgrade prompt
        const usedCount = usage?.exports_count ?? 0;
        const remaining = getRemainingCount('exports') ?? 0;
        setExportContext({
          requestedCount: propertyCount,
          remainingCount: remaining,
          usedCount,
          maxCount: maxMonthly,
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
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">My Lists</h1>
              <p className="text-muted-foreground">
                Organize and manage your lead collections
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create New List
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : lists.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <h3 className="text-lg font-semibold">No lists yet</h3>
                <p className="text-muted-foreground">
                  Create your first list to start organizing your leads, or use "Add All to List" from the Properties page.
                </p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First List
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lists.map((list) => (
                <Card key={list.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <span className="flex-1 truncate">{list.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setListToDelete({ id: list.id, name: list.name });
                          setDeleteDialogOpen(true);
                        }}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {list.property_count.toLocaleString()} {list.property_count === 1 ? "property" : "properties"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(list.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => navigate(`/lists/${list.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleExportList(list.id, list.name, list.property_count)}
                        disabled={isExporting === list.id || list.property_count === 0}
                      >
                        {isExporting === list.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Export
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Create List Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New List</DialogTitle>
              <DialogDescription>
                Give your list a name to start organizing your leads
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="list-name">List Name</Label>
                <Input
                  id="list-name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., High Priority, Q1 Targets"
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
