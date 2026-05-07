// TODO(types): Remove `as any` cast once Supabase types are regenerated
// post-staging-apply. See PR #156 description for context.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type ReviewRow = {
  domain: string;
  job_id: string;
  job_subtype: string | null;
  jurisdiction: string | null;
  state: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function useNeedsHumanReviewQueue() {
  return useQuery({
    queryKey: ["ops-needs-human-review"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_needs_human_review_queue")
        .select("*");
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
    refetchInterval: 15000,
  });
}

export function NeedsHumanReviewTable() {
  const { data: rows = [], isLoading } = useNeedsHumanReviewQueue();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Eye className="h-5 w-5" /> Needs human review
          {rows.length > 0 && (
            <Badge variant="destructive" className="ml-1 text-xs h-5 px-1">
              {rows.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">No jobs awaiting review.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Domain</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[80px]">State</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[150px]">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.domain}-${row.job_id}`}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{row.domain}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.job_subtype ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{row.state ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.jurisdiction ?? "—"}</TableCell>
                    <TableCell className="text-sm truncate max-w-[300px]">
                      {row.error_message ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {format(new Date(row.created_at), "MMM d, HH:mm")}
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
