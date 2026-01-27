import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { useSubscription } from "@/hooks/useSubscription";
import { Plus, Trash2, Eye, Download, Loader2 } from "lucide-react";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { AppLayout } from "@/components/layout/AppLayout";
import { UpgradePrompt } from "@/components/subscription/UpgradePrompt";

interface LeadList {
  id: string;
  name: string;
  created_at: string;
  property_count: number;
}

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  last_updated: string | null;
  days_open: number | null;
  case_id: string | null;
  // NOTE: description and raw_description are NEVER included for legal safety
}

interface LeadActivity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  violations: Violation[];
  latest_activity?: LeadActivity | null;
}

export function Lists() {
  const [lists, setLists] = useState<LeadList[]>([]);
  const [selectedList, setSelectedList] = useState<LeadList | null>(null);
  const [listProperties, setListProperties] = useState<PropertyWithViolations[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<LeadList | null>(null);
  const [newListName, setNewListName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const { toast } = useToast();
  const { checkLimit, trackUsage, refetch: refetchSubscription, getRemainingCount, plan } = useSubscription();

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("lead_lists")
        .select(`
          id,
          name,
          created_at,
          list_properties (count)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedLists = (data || []).map((list: any) => ({
        id: list.id,
        name: list.name,
        created_at: list.created_at,
        property_count: list.list_properties?.[0]?.count || 0,
      }));

      setLists(formattedLists);
    } catch (error) {
      console.error("Error fetching lists:", error);
      toast({
        title: "Error",
        description: "Failed to load lists",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to create a list",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("lead_lists")
        .insert({ name: newListName.trim(), user_id: user.id });

      if (error) throw error;

      toast({
        title: "Success",
        description: "List created successfully",
      });

      setNewListName("");
      setCreateDialogOpen(false);
      fetchLists();
    } catch (error) {
      console.error("Error creating list:", error);
      toast({
        title: "Error",
        description: "Failed to create list",
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
      if (selectedList?.id === listToDelete.id) {
        setSelectedList(null);
      }
      fetchLists();
    } catch (error) {
      console.error("Error deleting list:", error);
      toast({
        title: "Error",
        description: "Failed to delete list",
        variant: "destructive",
      });
    }
  };

  const handleViewList = async (list: LeadList) => {
    setSelectedList(list);
    setLoadingList(true);
    setLoadingProgress("Loading property IDs...");
    setListProperties([]); // Clear previous list

    try {
      // Fetch ALL property IDs in this list with pagination
      // Supabase default limit is 1000, so we need to paginate
      const BATCH_SIZE = 1000;
      let allPropertyIds: string[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: listPropertiesData, error: listError } = await supabase
          .from("list_properties")
          .select("property_id")
          .eq("list_id", list.id)
          .range(offset, offset + BATCH_SIZE - 1);

        if (listError) throw listError;

        const batchIds = listPropertiesData?.map((lp) => lp.property_id) || [];
        allPropertyIds = [...allPropertyIds, ...batchIds];
        setLoadingProgress(`Found ${allPropertyIds.length.toLocaleString()} properties...`);

        hasMore = batchIds.length === BATCH_SIZE;
        offset += BATCH_SIZE;
      }

      const propertyIds = allPropertyIds;

      if (propertyIds.length === 0) {
        setListProperties([]);
        setLoadingList(false);
        return;
      }

      // Fetch properties in batches to avoid Supabase limits
      // The .in() operator has PostgreSQL limits on array size
      const IN_BATCH_SIZE = 500; // Safe batch size for IN queries
      let allPropertiesData: any[] = [];
      let allViolationsData: Violation[] = [];
      let allActivitiesData: LeadActivity[] = [];
      const totalBatches = Math.ceil(propertyIds.length / IN_BATCH_SIZE);

      for (let i = 0; i < propertyIds.length; i += IN_BATCH_SIZE) {
        const batchIndex = Math.floor(i / IN_BATCH_SIZE) + 1;
        setLoadingProgress(`Loading batch ${batchIndex} of ${totalBatches} (${allPropertiesData.length.toLocaleString()} loaded)...`);

        const batchIds = propertyIds.slice(i, i + IN_BATCH_SIZE);

        // Fetch properties batch
        const { data: propertiesData, error: propertiesError } = await supabase
          .from("properties")
          .select("*")
          .in("id", batchIds);

        if (propertiesError) throw propertiesError;
        allPropertiesData = [...allPropertiesData, ...(propertiesData || [])];

        // Fetch violations batch - ONLY clean fields, NEVER raw_description
        const { data: violationsData, error: violationsError } = await supabase
          .from("violations")
          .select("id, property_id, violation_type, status, opened_date, last_updated, days_open, case_id")
          .in("property_id", batchIds);

        if (violationsError) throw violationsError;
        allViolationsData = [...allViolationsData, ...(violationsData || [])];

        // Fetch activities batch
        const { data: activitiesData, error: activitiesError } = await supabase
          .from("lead_activity")
          .select("*")
          .in("property_id", batchIds)
          .order("created_at", { ascending: false });

        if (activitiesError) throw activitiesError;
        allActivitiesData = [...allActivitiesData, ...(activitiesData || [])];
      }

      setLoadingProgress("Processing data...");

      // Group violations by property_id
      const violationsByProperty = allViolationsData.reduce((acc, violation) => {
        if (violation.property_id) {
          if (!acc[violation.property_id]) {
            acc[violation.property_id] = [];
          }
          acc[violation.property_id].push(violation);
        }
        return acc;
      }, {} as Record<string, Violation[]>);

      // Get latest activity by property_id
      const latestActivityByProperty = allActivitiesData.reduce((acc, activity) => {
        if (activity.property_id && !acc[activity.property_id]) {
          acc[activity.property_id] = activity;
        }
        return acc;
      }, {} as Record<string, LeadActivity>);

      // Combine data
      const propertiesWithViolations = allPropertiesData.map(property => ({
        ...property,
        violations: violationsByProperty[property.id] || [],
        latest_activity: latestActivityByProperty[property.id] || null,
      }));

      setListProperties(propertiesWithViolations);
    } catch (error) {
      console.error("Error fetching list properties:", error);
      toast({
        title: "Error",
        description: "Failed to load list properties",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
      setLoadingProgress("");
    }
  };

  const handleExportCSV = async () => {
    const properties = selectedList ? listProperties : [];

    if (properties.length === 0) {
      toast({
        title: "Nothing to export",
        description: "No properties to export",
        variant: "destructive",
      });
      return;
    }

    // Check quota before export - count is PER PROPERTY, not per operation
    const propertyCount = properties.length;
    const remaining = getRemainingCount('exports');

    // For unlimited plans (remaining === null), skip the check
    if (remaining !== null && propertyCount > remaining) {
      toast({
        title: "Export Limit Exceeded",
        description: `You have ${remaining.toLocaleString()} property exports remaining this month. This export requires ${propertyCount.toLocaleString()}. Upgrade your plan to continue.`,
        variant: "destructive",
        duration: 8000,
      });
      setShowUpgradePrompt(true);
      return;
    }

    // Also do the server-side check for safety
    const limitResult = await checkLimit('exports', propertyCount);
    if (!limitResult.allowed) {
      toast({
        title: "Export Limit Exceeded",
        description: limitResult.message || `Insufficient export quota. You need ${propertyCount.toLocaleString()} but don't have enough remaining.`,
        variant: "destructive",
        duration: 8000,
      });
      setShowUpgradePrompt(true);
      return;
    }

    setIsExporting(true);

    try {
      // Estimate export time
      const estimatedSeconds = Math.max(2, Math.ceil(properties.length / 5000));
      const estimatedTime = estimatedSeconds > 60
        ? `~${Math.ceil(estimatedSeconds / 60)} minute${Math.ceil(estimatedSeconds / 60) > 1 ? 's' : ''}`
        : `~${estimatedSeconds} seconds`;

      toast({
        title: "Generating Export",
        description: `Preparing ${properties.length.toLocaleString()} properties for download. ${estimatedTime}`,
        duration: 5000,
      });

      const csv = [
        ["Address", "City", "State", "ZIP", "Snap Score", "Violations", "Days Open"].join(","),
        ...properties.map(p => [
          `"${(p.address || "").replace(/"/g, '""')}"`,
          `"${(p.city || "").replace(/"/g, '""')}"`,
          p.state,
          p.zip,
          p.snap_score ?? "N/A",
          p.violations.length,
          Math.max(...p.violations.map(v => v.days_open ?? 0), 0)
        ].join(","))
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snap-${selectedList?.name.replace(/\s+/g, "-").toLowerCase() || "export"}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();

      // Track usage after successful export - count PER PROPERTY
      await trackUsage('exports', propertyCount);

      // Small delay to ensure backend has committed the usage update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refetch subscription to update UI
      await refetchSubscription();

      toast({
        title: "Export Complete",
        description: `Successfully exported ${properties.length.toLocaleString()} properties (${propertyCount.toLocaleString()} counted against quota)`,
      });
    } catch (error) {
      console.error('[Lists] Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export properties. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
      {selectedList ? (
        // Viewing a specific list
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Button
                variant="ghost"
                onClick={() => setSelectedList(null)}
                className="mb-2"
              >
                ← Back to Lists
              </Button>
              <h1 className="text-2xl font-bold text-foreground">
                {selectedList.name}
              </h1>
              <p className="text-muted-foreground">
                {listProperties.length} properties in this list
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={listProperties.length === 0 || isExporting || loadingList}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV ({listProperties.length.toLocaleString()})
                  </>
                )}
              </Button>
            </div>
          </div>

          {loadingList ? (
            <Card className="p-12 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
                <p className="text-muted-foreground">{loadingProgress || "Loading..."}</p>
              </div>
            </Card>
          ) : listProperties.length > 0 ? (
            <LeadsTable properties={listProperties} />
          ) : (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No properties in this list yet</p>
            </Card>
          )}
        </div>
      ) : (
        // Lists overview
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

          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
          ) : lists.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="max-w-md mx-auto space-y-4">
                <h3 className="text-lg font-semibold">No lists yet</h3>
                <p className="text-muted-foreground">
                  Create your first list to start organizing your leads
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
                      <span className="flex-1">{list.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setListToDelete(list);
                          setDeleteDialogOpen(true);
                        }}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {list.property_count} {list.property_count === 1 ? "property" : "properties"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(list.created_at).toLocaleDateString()}
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleViewList(list)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View List
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
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
            <Button onClick={handleCreateList}>Create List</Button>
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

      {/* Upgrade Prompt for export limits */}
      <UpgradePrompt
        open={showUpgradePrompt}
        onOpenChange={(open) => setShowUpgradePrompt(open)}
        limitType="exports"
      />
      </div>
    </AppLayout>
  );
}

export default Lists;
