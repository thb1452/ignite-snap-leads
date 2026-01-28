import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useListProperties, useRemoveFromList, useUserLists } from "@/hooks/useLists";
import { exportFilteredCsv } from "@/services/export";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradePrompt } from "@/components/subscription/UpgradePrompt";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Download,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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

const PAGE_SIZE = 50;

export function ListDetail() {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { checkLimit, refetch: refetchSubscription, plan } = useSubscription();

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Fetch list details
  const { data: lists = [] } = useUserLists();
  const currentList = lists.find((l) => l.id === listId);

  // Fetch properties in list
  const { data, isLoading, refetch } = useListProperties(listId || null, page, PAGE_SIZE);
  const properties = data?.items || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const removeFromListMutation = useRemoveFromList();

  const allSelected = properties.length > 0 && selectedIds.length === properties.length;

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : properties.map((p) => p.id));
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      let idsToExport: string[];

      if (selectedIds.length > 0) {
        // Export only selected properties
        idsToExport = selectedIds;
      } else {
        // Export ALL properties in the list — fetch every ID from list_properties
        setExportProgress("Fetching all property IDs...");
        const allIds: string[] = [];
        const BATCH = 1000;
        let offset = 0;

        while (true) {
          const { data: batch, error } = await supabase
            .from("list_properties")
            .select("property_id")
            .eq("list_id", listId!)
            .range(offset, offset + BATCH - 1);

          if (error) throw new Error(`Failed to fetch property IDs: ${error.message}`);
          if (!batch || batch.length === 0) break;

          allIds.push(...batch.map((r) => r.property_id));
          offset += BATCH;
          setExportProgress(`Fetched ${allIds.length.toLocaleString()} property IDs...`);

          if (batch.length < BATCH) break; // last page
        }

        idsToExport = allIds;
      }

      if (idsToExport.length === 0) {
        toast({
          title: "Nothing to export",
          description: "No properties to export",
          variant: "destructive",
        });
        return;
      }

      // Per-property quota check
      const propertyCount = idsToExport.length;
      const limitResult = await checkLimit("exports", propertyCount);
      if (!limitResult.allowed) {
        setShowUpgradePrompt(true);
        return;
      }

      setExportProgress(`Exporting ${propertyCount.toLocaleString()} properties...`);

      await exportFilteredCsv({
        propertyIds: idsToExport,
        expectedPropertyCount: propertyCount,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Exported ${propertyCount.toLocaleString()} properties`,
      });

      setSelectedIds([]);
    } catch (error: any) {
      if (error.message === "EXPORT_LIMIT_EXCEEDED") {
        setShowUpgradePrompt(true);
        return;
      }
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleRemoveSelected = async () => {
    if (!listId || selectedIds.length === 0) return;

    try {
      await removeFromListMutation.mutateAsync({
        listId,
        propertyIds: selectedIds,
      });

      toast({
        title: "Removed",
        description: `Removed ${selectedIds.length} properties from list`,
      });

      setSelectedIds([]);
      setShowRemoveDialog(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Failed to remove",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  if (!listId) {
    navigate("/lists");
    return null;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/lists")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{currentList?.name || "List"}</h1>
              <p className="text-muted-foreground">
                {totalCount.toLocaleString()} properties
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowRemoveDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove ({selectedIds.length})
              </Button>
            )}
            <Button
              onClick={handleExport}
              disabled={isExporting || properties.length === 0}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isExporting && exportProgress
                ? exportProgress
                : selectedIds.length > 0
                ? `Export (${selectedIds.length})`
                : `Export All (${totalCount.toLocaleString()})`}
            </Button>
          </div>
        </div>

        {/* Property Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : properties.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No properties in this list yet</p>
            <Button className="mt-4" onClick={() => navigate("/leads")}>
              Add Properties from Search
            </Button>
          </Card>
        ) : (
          <>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleToggleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left">Address</th>
                      <th className="p-3 text-left">City</th>
                      <th className="p-3 text-left">State</th>
                      <th className="p-3 text-left">ZIP</th>
                      <th className="p-3 text-center">Score</th>
                      <th className="p-3 text-center">Violations</th>
                      <th className="p-3 text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((property) => (
                      <tr
                        key={property.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => handleToggleSelect(property.id)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(property.id)}
                            onCheckedChange={() => handleToggleSelect(property.id)}
                          />
                        </td>
                        <td className="p-3 font-medium">{property.address}</td>
                        <td className="p-3">{property.city}</td>
                        <td className="p-3">{property.state}</td>
                        <td className="p-3">{property.zip}</td>
                        <td className="p-3 text-center">
                          {property.snap_score !== null ? (
                            <Badge
                              variant={
                                property.snap_score >= 70
                                  ? "default"
                                  : property.snap_score >= 40
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {property.snap_score}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline">
                            {property.open_violations || 0} / {property.total_violations || 0}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {property.enforcement_type === "water_shutoff" ? (
                            <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                              💧 Water
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Code</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Remove Confirmation */}
        <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Properties</AlertDialogTitle>
              <AlertDialogDescription>
                Remove {selectedIds.length} properties from this list? The properties
                will not be deleted, only removed from this list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveSelected}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Upgrade Prompt */}
        <UpgradePrompt
          open={showUpgradePrompt}
          onOpenChange={setShowUpgradePrompt}
          limitType="exports"
          currentPlan={plan?.name}
        />
      </div>
    </AppLayout>
  );
}

export default ListDetail;
