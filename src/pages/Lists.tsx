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
import { Plus, Trash2, Eye } from "lucide-react";
import { LeadsTable } from "@/components/leads/LeadsTable";

interface LeadList {
  id: string;
  name: string;
  created_at: string;
  property_count: number;
}

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
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
  const { toast } = useToast();

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
      const { error } = await supabase
        .from("lead_lists")
        .insert({ name: newListName.trim() });

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
    
    try {
      // Fetch properties in this list
      const { data: listPropertiesData, error: listError } = await supabase
        .from("list_properties")
        .select("property_id")
        .eq("list_id", list.id);

      if (listError) throw listError;

      const propertyIds = listPropertiesData?.map((lp) => lp.property_id) || [];

      if (propertyIds.length === 0) {
        setListProperties([]);
        return;
      }

      // Fetch properties
      const { data: propertiesData, error: propertiesError } = await supabase
        .from("properties")
        .select("*")
        .in("id", propertyIds);

      if (propertiesError) throw propertiesError;

      // Fetch violations
      const { data: violationsData, error: violationsError } = await supabase
        .from("violations")
        .select("*")
        .in("property_id", propertyIds);

      if (violationsError) throw violationsError;

      // Fetch latest activities
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("lead_activity")
        .select("*")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false });

      if (activitiesError) throw activitiesError;

      // Group violations by property_id
      const violationsByProperty = (violationsData || []).reduce((acc, violation) => {
        if (violation.property_id) {
          if (!acc[violation.property_id]) {
            acc[violation.property_id] = [];
          }
          acc[violation.property_id].push(violation);
        }
        return acc;
      }, {} as Record<string, Violation[]>);

      // Get latest activity by property_id
      const latestActivityByProperty = (activitiesData || []).reduce((acc, activity) => {
        if (activity.property_id && !acc[activity.property_id]) {
          acc[activity.property_id] = activity;
        }
        return acc;
      }, {} as Record<string, LeadActivity>);

      // Combine data
      const propertiesWithViolations = (propertiesData || []).map(property => ({
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
    }
  };

  return (
    <div className="p-6">
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
          </div>

          {listProperties.length > 0 ? (
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
              Give your list a name to help organize your leads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={!newListName.trim()}>
              Create List
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
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteList} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
