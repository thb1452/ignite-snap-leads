import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
  status: string;
  opened_date: string | null;
  days_open: number | null;
}

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  violations: Violation[];
}

interface LeadsTableProps {
  properties: PropertyWithViolations[];
}

type SortField = "snap_score" | "address" | "violation_count" | "days_open";
type SortDirection = "asc" | "desc" | null;

export function LeadsTable({ properties }: LeadsTableProps) {
  const [sortField, setSortField] = useState<SortField>("snap_score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    if (sortDirection === "asc") return <ArrowUp className="ml-2 h-4 w-4" />;
    if (sortDirection === "desc") return <ArrowDown className="ml-2 h-4 w-4" />;
    return <ArrowUpDown className="ml-2 h-4 w-4" />;
  };

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("snap_score")}
                className="flex items-center font-semibold hover:bg-muted"
              >
                SnapScore
                <SortIcon field="snap_score" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("address")}
                className="flex items-center font-semibold hover:bg-muted"
              >
                Address
                <SortIcon field="address" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("violation_count")}
                className="flex items-center font-semibold hover:bg-muted"
              >
                Violation Count
                <SortIcon field="violation_count" />
              </Button>
            </TableHead>
            <TableHead>Primary Violation</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort("days_open")}
                className="flex items-center font-semibold hover:bg-muted"
              >
                Days Open
                <SortIcon field="days_open" />
              </Button>
            </TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProperties.map((property, index) => (
            <TableRow
              key={property.id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <TableCell className="font-medium">
                <Badge
                  variant={getScoreBadgeVariant(property.snap_score)}
                  className="text-base px-3 py-1"
                >
                  {property.snap_score && property.snap_score >= 80 ? "🔥 " : ""}
                  {property.snap_score ?? "N/A"}
                </Badge>
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-semibold text-foreground">{property.address}</div>
                  <div className="text-sm text-muted-foreground">
                    {property.city}, {property.state} {property.zip}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {property.violations.length >= 3 ? (
                  <Badge variant="destructive" className="font-semibold">
                    ⚠️ MULTIPLE ({property.violations.length})
                  </Badge>
                ) : (
                  <Badge variant="secondary">{property.violations.length}</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground max-w-xs">
                {getPrimaryViolation(property.violations)}
              </TableCell>
              <TableCell>
                <Badge className={getStatusBadgeClass(getPrimaryStatus(property.violations))}>
                  {getPrimaryStatus(property.violations)}
                </Badge>
              </TableCell>
              <TableCell className="text-foreground">
                {getMaxDaysOpen(property.violations)} days
              </TableCell>
              <TableCell>
                <Button variant="outline" size="sm">
                  View Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
