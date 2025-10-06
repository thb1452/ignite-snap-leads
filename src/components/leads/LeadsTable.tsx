import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PropertyDetailPanel } from "./PropertyDetailPanel";

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

interface LeadsTableProps {
  properties: PropertyWithViolations[];
}

type SortField = "snap_score" | "address" | "violation_count" | "days_open";
type SortDirection = "asc" | "desc" | null;

export function LeadsTable({ properties }: LeadsTableProps) {
  const [sortField, setSortField] = useState<SortField>("snap_score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithViolations | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  const handlePropertyClick = (property: PropertyWithViolations) => {
    setSelectedProperty(property);
    setDetailPanelOpen(true);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : sortDirection === "desc" ? null : "asc");
      if (sortDirection === "desc") {
        setSortField("snap_score");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedProperties = [...properties].sort((a, b) => {
    if (!sortDirection) return 0;
    
    let aValue: number | string = 0;
    let bValue: number | string = 0;

    switch (sortField) {
      case "snap_score":
        aValue = a.snap_score ?? 0;
        bValue = b.snap_score ?? 0;
        break;
      case "address":
        aValue = a.address.toLowerCase();
        bValue = b.address.toLowerCase();
        break;
      case "violation_count":
        aValue = a.violations.length;
        bValue = b.violations.length;
        break;
      case "days_open":
        aValue = Math.max(...a.violations.map(v => v.days_open ?? 0));
        bValue = Math.max(...b.violations.map(v => v.days_open ?? 0));
        break;
    }

    if (sortDirection === "asc") {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const getScoreBadgeVariant = (score: number | null) => {
    if (!score) return "secondary";
    if (score >= 80) return "score-high";
    if (score >= 50) return "score-medium";
    return "score-low";
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
        return "bg-destructive text-destructive-foreground";
      case "pending":
        return "bg-yellow-500 text-white";
      case "closed":
        return "bg-green-600 text-white";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const getPrimaryViolation = (violations: Violation[]) => {
    if (violations.length === 0) return "No violations";
    const description = violations[0].description || violations[0].violation_type;
    return description.length > 60 ? description.substring(0, 60) + "..." : description;
  };

  const getMaxDaysOpen = (violations: Violation[]) => {
    if (violations.length === 0) return 0;
    return Math.max(...violations.map(v => v.days_open ?? 0));
  };

  const getPrimaryStatus = (violations: Violation[]) => {
    if (violations.length === 0) return "N/A";
    return violations[0].status;
  };

  const getActivityStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Deal Made":
        return "bg-green-600 text-white";
      case "Called - Interested":
        return "bg-primary text-primary-foreground";
      case "Called - Not Interested":
        return "bg-muted text-muted-foreground";
      case "Called - No Answer":
      case "Not Called":
        return "bg-yellow-500 text-white";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    if (sortDirection === "asc") return <ArrowUp className="ml-2 h-4 w-4" />;
    if (sortDirection === "desc") return <ArrowDown className="ml-2 h-4 w-4" />;
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  const scoreClass = (n: number | null) => {
    if (!n) return 'bg-slate-100 text-ink-600 border border-slate-200';
    if (n >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (n >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-ink-600 border border-slate-200';
  };

  return (
    <>
      <PropertyDetailPanel
        property={selectedProperty}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
      />
      <div className="rounded-2xl shadow-card overflow-hidden bg-white">
        <Table>
          <TableHeader className="sticky top-14 bg-white/90 backdrop-blur z-10">
            <TableRow className="text-ink-500 border-b">
              <TableHead className="py-3 text-xs uppercase tracking-wider font-semibold">SnapScore</TableHead>
              <TableHead className="py-3 text-xs uppercase tracking-wider font-semibold">Address</TableHead>
              <TableHead className="py-3 text-xs uppercase tracking-wider font-semibold">Violations</TableHead>
              <TableHead className="py-3 text-xs uppercase tracking-wider font-semibold">Primary</TableHead>
              <TableHead className="py-3 text-xs uppercase tracking-wider font-semibold text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {sortedProperties.map((property, index) => (
              <TableRow
                key={property.id}
                className={`cursor-pointer transition-all hover:bg-slate-50/60 border-l-4 border-transparent hover:border-l-brand ${
                  index % 2 === 0 ? 'bg-white' : 'bg-slate-25'
                }`}
                onClick={() => handlePropertyClick(property)}
              >
                <TableCell className="py-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${scoreClass(property.snap_score)}`}>
                    {property.snap_score && property.snap_score >= 80 ? "🔥 " : ""}
                    {property.snap_score ?? "N/A"}
                  </span>
                </TableCell>
                <TableCell className="py-4">
                  <div className="font-bold text-ink-900 text-base">{property.address}</div>
                  <div className="text-sm text-ink-400 mt-0.5">
                    {property.city}, {property.state} {property.zip}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  {property.violations.length > 1 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      Multiple ({property.violations.length})
                    </span>
                  ) : (
                    <span className="text-ink-400 text-sm">{property.violations.length}</span>
                  )}
                </TableCell>
                <TableCell className="py-4 text-ink-600 text-sm max-w-xs">
                  {getPrimaryViolation(property.violations)}
                </TableCell>
                <TableCell className="py-4 text-right pr-4">
                  <button
                    className="text-brand hover:underline text-sm font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePropertyClick(property);
                    }}
                  >
                    View Details
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
