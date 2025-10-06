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

  const getScoreBadgeVariant = (score: number | null): "score-high" | "score-medium" | "score-low" | "secondary" => {
    if (!score) return "secondary";
    if (score >= 80) return "score-high";
    if (score >= 60) return "score-medium";
    return "score-low";
  };

  const getScoreBadgeSize = (score: number | null): "default" | "sm" | "md" | "lg" | "xl" => {
    if (!score) return "sm";
    if (score >= 80) return "lg";
    if (score >= 60) return "md";
    return "default";
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

  return (
    <>
      <PropertyDetailPanel
        property={selectedProperty}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
      />
      <div className="rounded-lg border bg-card shadow-md">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("snap_score")}
                className="flex items-center text-xs font-semibold uppercase tracking-wider hover:bg-muted"
              >
                SnapScore
                <SortIcon field="snap_score" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("address")}
                className="flex items-center text-xs font-semibold uppercase tracking-wider hover:bg-muted"
              >
                Address
                <SortIcon field="address" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("violation_count")}
                className="flex items-center text-xs font-semibold uppercase tracking-wider hover:bg-muted"
              >
                Violation Count
                <SortIcon field="violation_count" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Primary Violation</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">My Status</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("days_open")}
                className="flex items-center text-xs font-semibold uppercase tracking-wider hover:bg-muted"
              >
                Days Open
                <SortIcon field="days_open" />
              </Button>
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProperties.map((property, index) => (
            <TableRow
              key={property.id}
              className={`cursor-pointer transition-all duration-200 border-l-4 border-l-transparent hover:border-l-primary hover:bg-primary/5 hover:shadow-sm ${
                index % 2 === 0 ? 'bg-white' : 'bg-muted/20'
              }`}
              onClick={() => handlePropertyClick(property)}
            >
              <TableCell className="font-medium py-5">
                <div className="flex items-center justify-center">
                  <Badge
                    variant={getScoreBadgeVariant(property.snap_score)}
                    size={getScoreBadgeSize(property.snap_score)}
                    className="font-extrabold"
                    style={
                      property.snap_score && property.snap_score >= 80
                        ? { background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)' }
                        : property.snap_score && property.snap_score >= 60
                        ? { background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)' }
                        : undefined
                    }
                  >
                    {property.snap_score && property.snap_score >= 80 ? "🔥" : ""}
                    {property.snap_score ?? "N/A"}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="py-5">
                <div>
                  <div className="font-bold text-base text-foreground leading-tight">{property.address}</div>
                  <div className="text-[13px] text-muted-foreground font-normal mt-0.5">
                    {property.city}, {property.state} {property.zip}
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-5">
                {property.violations.length >= 3 ? (
                  <Badge variant="destructive" className="font-bold text-sm px-3 py-1.5 shadow-md">
                    ⚠️ MULTIPLE ({property.violations.length})
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="font-semibold">{property.violations.length}</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground max-w-xs py-5">
                <div className="text-sm leading-relaxed">{getPrimaryViolation(property.violations)}</div>
              </TableCell>
              <TableCell className="py-5">
                {property.latest_activity ? (
                  <Badge className={`${getActivityStatusBadgeClass(property.latest_activity.status)} font-semibold`}>
                    {property.latest_activity.status}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="py-5">
                <Badge className={`${getStatusBadgeClass(getPrimaryStatus(property.violations))} font-semibold`}>
                  {getPrimaryStatus(property.violations)}
                </Badge>
              </TableCell>
              <TableCell className="text-foreground font-medium py-5">
                {getMaxDaysOpen(property.violations)} days
              </TableCell>
              <TableCell className="py-5">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="font-medium hover:-translate-y-0.5 transition-transform shadow-sm hover:shadow-md"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePropertyClick(property);
                  }}
                >
                  View Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </>
  );
}
