import { useQuery } from "@tanstack/react-query";
import { getJobLedger } from "@/services/jobs";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface JobLedgerTableProps {
  jobId: string;
}

export function JobLedgerTable({ jobId }: JobLedgerTableProps) {
  const { data: ledgerEntries, isLoading } = useQuery({
    queryKey: ['job-ledger', jobId],
    queryFn: () => getJobLedger(jobId),
  });

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  if (!ledgerEntries || ledgerEntries.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">No ledger entries found</p>
      </Card>
    );
  }

  const totalCharged = ledgerEntries.filter(e => e.delta < 0).reduce((sum, e) => sum + Math.abs(e.delta), 0);
  const totalRefunded = ledgerEntries.filter(e => e.delta > 0).reduce((sum, e) => sum + e.delta, 0);
  const netCost = totalCharged - totalRefunded;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Charged</div>
          <div className="text-2xl font-bold text-red-600">-{totalCharged}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Refunded</div>
          <div className="text-2xl font-bold text-green-600">+{totalRefunded}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Net Cost</div>
          <div className="text-2xl font-bold">{netCost}</div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Property</TableHead>
              <TableHead className="text-right">Credits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgerEntries.map((entry) => {
              const isCharge = entry.delta < 0;
              const propertyId = (entry.meta as any)?.property_id;
              
              return (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm">
                    {new Date(entry.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isCharge ? "destructive" : "default"}>
                      {entry.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {propertyId ? propertyId.slice(0, 8) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={isCharge ? "text-red-600" : "text-green-600"}>
                      {isCharge ? '' : '+'}{entry.delta}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
