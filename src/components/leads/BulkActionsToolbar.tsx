import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Download, FolderPlus, CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddToListDialog } from "./AddToListDialog";

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  violations: any[];
}

interface BulkActionsToolbarProps {
  selectedCount: number;
  selectedProperties: PropertyWithViolations[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

const STATUS_OPTIONS = [
  "Not Called",
  "Called - No Answer",
  "Called - Interested",
  "Called - Not Interested",
  "Deal Made",
] as const;

export function BulkActionsToolbar({
  selectedCount,
  selectedProperties,
  onClearSelection,
  onActionComplete,
}: BulkActionsToolbarProps) {
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const { toast } = useToast();

  const handleExportCSV = () => {
    const headers = ["Address", "City", "State", "ZIP", "SnapScore", "Violations", "Status"];
    const csvContent = [
      headers.join(","),
      ...selectedProperties.map(prop => [
        `"${prop.address}"`,
        `"${prop.city}"`,
        `"${prop.state}"`,
        prop.zip,
        prop.snap_score ?? "N/A",
        prop.violations.length,
        (prop as any).latest_activity?.status || "N/A"
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Success",
      description: `Exported ${selectedCount} properties to CSV`,
    });
  };

  const handleBulkStatusUpdate = async () => {
    if (!bulkStatus) {
      toast({
        title: "Error",
        description: "Please select a status",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const activities = selectedProperties.map(prop => ({
        property_id: prop.id,
        status: bulkStatus,
        notes: bulkNotes.trim() || null,
      }));

      const { error } = await supabase
        .from("lead_activity")
        .insert(activities);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Updated status for ${selectedCount} properties`,
      });

      setBulkStatus("");
      setBulkNotes("");
      setShowStatusUpdate(false);
      onActionComplete();
      onClearSelection();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAddToList = () => {
    setAddToListOpen(true);
  };

  const handleListAdded = () => {
    toast({
      title: "Success",
      description: `Added ${selectedCount} properties to list`,
    });
    onActionComplete();
    onClearSelection();
  };

  return (
    <>
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground shadow-lg">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <X className="h-4 w-4" />
            </Button>
            <span className="font-semibold">
              {selectedCount} {selectedCount === 1 ? "property" : "properties"} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCSV}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkAddToList}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Add to List
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowStatusUpdate(!showStatusUpdate)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Update Status
            </Button>
          </div>
        </div>

        {/* Bulk Status Update Form */}
        {showStatusUpdate && (
          <div className="border-t border-primary-foreground/20 p-4 bg-primary-foreground/5">
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-primary-foreground">Status</Label>
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="bg-background text-foreground">
                      <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-primary-foreground">Notes (Optional)</Label>
                  <Textarea
                    placeholder="Add notes for all selected properties..."
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    rows={2}
                    className="bg-background text-foreground"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleBulkStatusUpdate}
                  disabled={loading || !bulkStatus}
                  variant="secondary"
                >
                  {loading ? "Updating..." : `Update ${selectedCount} Properties`}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowStatusUpdate(false);
                    setBulkStatus("");
                    setBulkNotes("");
                  }}
                  className="bg-background"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Add to List Dialog */}
      <AddToListDialog
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
        propertyId={selectedProperties[0]?.id || ""}
        onListAdded={handleListAdded}
        currentListIds={[]}
        bulkMode={true}
        selectedPropertyIds={selectedProperties.map(p => p.id)}
      />
    </>
  );
}
