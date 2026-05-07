// TODO(types): Remove `as any` cast once Supabase types are regenerated
// post-staging-apply. See PR #156 description for context.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type JurisdictionRow = {
  registry: string;
  id: string;
  state: string | null;
  jurisdiction: string | null;
  city: string | null;
  source_name: string | null;
  source_type: string | null;
  status: string | null;
  last_checked_at: string | null;
  notes: string | null;
};

function useJurisdictionsNeedingVerification() {
  return useQuery({
    queryKey: ["ops-jurisdictions-needing-verification"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_jurisdictions_needing_verification")
        .select("*");
      if (error) throw error;
      return (data ?? []) as JurisdictionRow[];
    },
    refetchInterval: 60000,
  });
}

export function JurisdictionVerifierTable() {
  const { data: rows = [], isLoading } = useJurisdictionsNeedingVerification();

  const enrichmentCount = rows.filter((r) => r.registry === "enrichment").length;
  const foiaCount = rows.filter((r) => r.registry === "foia").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" /> Jurisdictions needing verification
        </CardTitle>
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {enrichmentCount} enrichment source(s) · {foiaCount} FOIA source(s)
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">All registered jurisdictions verified.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Registry</TableHead>
                  <TableHead className="w-[80px]">State</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="w-[140px]">Source name</TableHead>
                  <TableHead className="w-[120px]">Source type</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[150px]">Last checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.registry}-${row.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{row.registry}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{row.state ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.jurisdiction ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.city ?? "—"}</TableCell>
                    <TableCell className="text-xs">{row.source_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{row.source_type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "unverified" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {row.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {row.last_checked_at
                        ? format(new Date(row.last_checked_at), "MMM d, yyyy")
                        : "never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
